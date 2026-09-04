import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { grant, deduct, reserve, settle, release, costOf } from "@/lib/credits";
import { isAppError } from "@/lib/errors";
import { balanceOf, ledgerSum, makeUser, resetDatabase } from "../../test/helpers";

/**
 * The credit ledger is where a bug costs actual money, in both directions: a
 * user charged for nothing, or a render given away free. Every test here
 * asserts against real Postgres, because the guarantees being tested are
 * transactional ones that a mock would simply agree with.
 */

beforeEach(resetDatabase);

describe("the ledger invariant", () => {
  it("keeps SUM(ledger.delta) equal to the cached balance through any sequence", async () => {
    const user = await makeUser(0);

    await grant(user, 500, "SIGNUP_GRANT");
    await reserve(user, 120, { type: "job", id: "j1" });
    await settle(user, 120);
    await grant(user, 300, "PACK_PURCHASE");
    await reserve(user, 200, { type: "job", id: "j2" });
    await release(user, 200, { type: "job", id: "j2" });
    await deduct(user, 50, "ADMIN_DEDUCT");

    const { credits } = await balanceOf(user);
    expect(await ledgerSum(user)).toBe(credits);
    // 500 - 120 + 300 - 200 + 200 - 50
    expect(credits).toBe(630);
  });

  it("records balanceAfter matching the balance at that moment", async () => {
    const user = await makeUser(0);
    await grant(user, 100, "SIGNUP_GRANT");
    await reserve(user, 40, { type: "job", id: "j1" });

    const rows = await db.creditLedger.findMany({
      where: { userId: user },
      orderBy: { createdAt: "asc" },
    });

    expect(rows.map((r) => r.balanceAfter)).toEqual([100, 60]);
  });
});

describe("reserve", () => {
  it("moves credits into the held bucket rather than destroying them", async () => {
    const user = await makeUser(100);
    await reserve(user, 30, { type: "job", id: "j1" });

    expect(await balanceOf(user)).toEqual({ credits: 70, creditsHeld: 30 });
  });

  it("refuses when the balance will not cover it, and changes nothing", async () => {
    const user = await makeUser(10);

    await expect(reserve(user, 50, { type: "job", id: "j1" })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "INSUFFICIENT_CREDITS",
    );

    expect(await balanceOf(user)).toEqual({ credits: 10, creditsHeld: 0 });
    expect(
      await db.creditLedger.count({
        where: { userId: user, reason: "GENERATION_HOLD" },
      }),
    ).toBe(0);
  });

  /**
   * The one that matters. Ten simultaneous reservations against a balance that
   * covers three must settle at exactly three — the guard is a predicate
   * evaluated under the row lock the UPDATE takes, not a read followed by a
   * write. If this ever fails, users are spending credits they do not have.
   */
  it("lets exactly as many concurrent reservations succeed as the balance covers", async () => {
    const user = await makeUser(30); // covers 3 x 10

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        reserve(user, 10, { type: "job", id: `job-${index}` }),
      ),
    );

    const won = attempts.filter((a) => a.status === "fulfilled").length;
    expect(won).toBe(3);

    const { credits, creditsHeld } = await balanceOf(user);
    expect(credits).toBe(0);
    expect(creditsHeld).toBe(30);
    expect(await ledgerSum(user)).toBe(0);
  });
});

describe("release", () => {
  it("returns the credits and writes a refund row", async () => {
    const user = await makeUser(100);
    await reserve(user, 40, { type: "job", id: "j1" });
    await release(user, 40, { type: "job", id: "j1" }, "render failed");

    expect(await balanceOf(user)).toEqual({ credits: 100, creditsHeld: 0 });

    const refund = await db.creditLedger.findFirst({
      where: { userId: user, reason: "GENERATION_REFUND" },
    });
    expect(refund?.delta).toBe(40);
    expect(await ledgerSum(user)).toBe(100);
  });

  it("never drives held credits negative", async () => {
    const user = await makeUser(100);
    await reserve(user, 20, { type: "job", id: "j1" });

    // A double release should not corrupt the held bucket, whatever else it does.
    await release(user, 20, { type: "job", id: "j1" });
    await release(user, 20, { type: "job", id: "j1" });

    const { creditsHeld } = await balanceOf(user);
    expect(creditsHeld).toBeGreaterThanOrEqual(0);
  });
});

describe("deduct", () => {
  it("floors at zero rather than creating debt", async () => {
    const user = await makeUser(30);
    await deduct(user, 500, "ADMIN_DEDUCT");

    const { credits } = await balanceOf(user);
    expect(credits).toBe(0);
    expect(await ledgerSum(user)).toBe(0);
  });
});

describe("pricing", () => {
  it("charges a flat rate for a still and a per-second rate for motion", async () => {
    const still = await costOf({ durationSec: 5, tier: "STILL", voiceId: "none" });
    const motion = await costOf({ durationSec: 5, tier: "PREVIEW", voiceId: "none" });

    expect(still).toBe(4);
    expect(motion).toBe(70);
    // The cheap-iteration ratio the whole cost strategy depends on.
    expect(motion / still).toBeGreaterThanOrEqual(15);
  });

  it("adds the narration surcharge only when a voice is chosen", async () => {
    const silent = await costOf({ durationSec: 5, tier: "PREVIEW", voiceId: "none" });
    const spoken = await costOf({ durationSec: 5, tier: "PREVIEW", voiceId: "vikram" });

    expect(spoken - silent).toBe(4);
  });
});
