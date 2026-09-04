import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { RATE_LIMITS, consume, enforce, pruneRateLimits } from "@/lib/rate-limit";
import { resetDatabase } from "../../test/helpers";

/**
 * The limiter is one SQL statement, and the only interesting thing about it is
 * whether that statement holds under concurrency — which is exactly the
 * property a mocked database cannot tell you anything about. So, real Postgres,
 * same as the ledger and the queue.
 */

beforeEach(resetDatabase);

const LIMIT = RATE_LIMITS.estimate.limit;

describe("the window", () => {
  it("allows up to the limit and refuses past it", async () => {
    for (let request = 0; request < LIMIT; request += 1) {
      expect((await consume("estimate", "user-1")).allowed).toBe(true);
    }

    const over = await consume("estimate", "user-1");
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.resetSec).toBeGreaterThan(0);
  });

  it("counts each subject separately", async () => {
    for (let request = 0; request < LIMIT; request += 1) {
      await consume("estimate", "user-1");
    }

    expect((await consume("estimate", "user-1")).allowed).toBe(false);
    expect((await consume("estimate", "user-2")).allowed).toBe(true);
  });

  it("counts each rule separately for the same subject", async () => {
    for (let request = 0; request < RATE_LIMITS["billing.checkout"].limit; request += 1) {
      await consume("billing.checkout", "user-1");
    }

    expect((await consume("billing.checkout", "user-1")).allowed).toBe(false);
    expect((await consume("estimate", "user-1")).allowed).toBe(true);
  });

  /**
   * A window that never rolls over is a ban. Backdating the stored row is the
   * honest way to test this — the alternative is sleeping through a real one.
   */
  it("starts a fresh count once the window has rolled over", async () => {
    for (let request = 0; request < LIMIT; request += 1) {
      await consume("estimate", "user-1");
    }
    expect((await consume("estimate", "user-1")).allowed).toBe(false);

    await db.apiRateLimit.update({
      where: { key: "estimate:user-1" },
      data: { windowStart: new Date(Date.now() - 10 * 60_000) },
    });

    const next = await consume("estimate", "user-1");
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(LIMIT - 1);
  });
});

describe("under concurrency", () => {
  /**
   * The point of putting this in Postgres rather than process memory. If the
   * increment were a read-then-write, simultaneous requests would each read the
   * same count and the limit would be whatever the parallelism happened to be.
   */
  it("never allows more than the limit, however many arrive at once", async () => {
    const attempts = LIMIT + 40;

    const results = await Promise.all(
      Array.from({ length: attempts }, () => consume("estimate", "user-1")),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(LIMIT);
  });
});

describe("enforce", () => {
  it("throws a rate-limited error carrying a retry hint", async () => {
    for (let request = 0; request < LIMIT; request += 1) {
      await consume("estimate", "user-1");
    }

    await expect(enforce("estimate", "user-1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("stays out of the way below the limit", async () => {
    await expect(enforce("estimate", "user-1")).resolves.toBeUndefined();
  });
});

describe("pruning", () => {
  it("drops counters whose window closed long ago and keeps live ones", async () => {
    await consume("estimate", "recent");
    await consume("estimate", "ancient");
    await db.apiRateLimit.update({
      where: { key: "estimate:ancient" },
      data: { windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    expect(await pruneRateLimits()).toBe(1);
    expect(await db.apiRateLimit.count()).toBe(1);
  });
});
