import { beforeEach, describe, expect, it } from "vitest";
import { db, UTC_NOW } from "@/lib/db";
import { enqueue, claim, fail, cancel, reschedule, reclaimStale } from "@/lib/queue";
import { reserve } from "@/lib/credits";
import { budgetStatus, chargeBudget } from "@/lib/budget";
import {
  balanceOf,
  expectLedgerBalances,
  makeProject,
  makeUser,
  resetDatabase,
} from "../../test/helpers";

/**
 * The queue's job is to never lose work and never double-charge for it. Both
 * properties are enforced in SQL — `FOR UPDATE SKIP LOCKED` for claiming, and a
 * status guard for terminal transitions — so these run against real Postgres.
 */

beforeEach(resetDatabase);

async function makeJob(userId: string, credits = 70) {
  const projectId = await makeProject(userId);
  const job = await enqueue({ projectId, type: "GENERATE_PREVIEW", creditsHeld: credits });
  await reserve(userId, credits, { type: "job", id: job.id });
  return job;
}

describe("claiming", () => {
  /**
   * The property the whole worker design rests on. Five workers claiming at
   * once must partition the queue, never overlap — if two ever received the
   * same job we would pay a vendor twice for one render.
   */
  it("never hands the same job to two workers", async () => {
    const user = await makeUser(2_000);
    for (let index = 0; index < 12; index += 1) await makeJob(user, 10);

    const claims = await Promise.all(
      Array.from({ length: 5 }, (_, index) => claim(`worker-${index}`, 5)),
    );

    const ids = claims.flat().map((job) => job.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(ids.length).toBe(12);
  });

  it("leaves jobs whose runAfter is still in the future", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);
    await reschedule(job.id, 3_600);

    expect(await claim("worker", 10)).toHaveLength(0);
  });

  /**
   * The test above only fails on a machine whose timezone is not UTC, so on a
   * UTC CI box it would wave the bug through. This pins the actual defect: the
   * eligibility predicate must not depend on the session timezone at all.
   *
   * `runAfter` is a `timestamp` holding UTC while `now()` is a `timestamptz`,
   * so a bare `"runAfter" <= now()` is resolved through the session zone —
   * which made an hour-ahead job look overdue, defeating retry backoff and
   * letting work deferred past the daily spend cap run immediately.
   */
  it("reads the same instant from SQL as from the application clock", async () => {
    const before = Date.now();
    const [row] = await db.$queryRaw<{ ts: Date }[]>`SELECT ${UTC_NOW} AS ts`;
    const after = Date.now();

    // A bare now() drifts by the session's UTC offset — hours, not milliseconds.
    expect(row.ts.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row.ts.getTime()).toBeLessThanOrEqual(after + 1_000);
  });

  it("picks up deferred work once its window opens", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await db.job.update({
      where: { id: job.id },
      data: { status: "DEFERRED", runAfter: new Date(Date.now() - 1_000) },
    });

    expect(await claim("worker", 10)).toHaveLength(1);
  });
});

describe("failure handling", () => {
  it("retries a retryable failure below the attempt ceiling", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    expect(await fail(job.id, "provider hiccup", true)).toBe("retrying");

    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("QUEUED");
    expect(after.attempts).toBe(1);
    // Still held — the user has not been told anything went wrong.
    expect((await balanceOf(user)).creditsHeld).toBe(10);
  });

  it("gives up immediately on a terminal failure and refunds", async () => {
    const user = await makeUser(200);
    const before = (await balanceOf(user)).credits;
    const job = await makeJob(user, 10);

    expect(await fail(job.id, "invalid parameters", false)).toBe("dead");

    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("FAILED");
    expect(await balanceOf(user)).toEqual({ credits: before, creditsHeld: 0 });
    await expectLedgerBalances(user);
  });

  it("dead-letters once the attempt ceiling is reached, refunding exactly once", async () => {
    const user = await makeUser(200);
    const before = (await balanceOf(user)).credits;
    const job = await makeJob(user, 10);

    // maxAttempts defaults to 3.
    expect(await fail(job.id, "flaky", true)).toBe("retrying");
    expect(await fail(job.id, "flaky", true)).toBe("retrying");
    expect(await fail(job.id, "flaky", true)).toBe("dead");

    expect(await balanceOf(user)).toEqual({ credits: before, creditsHeld: 0 });
    await expectLedgerBalances(user);
  });

  /**
   * The bug this pins was invisible and total: retry worked, in the sense that
   * the job went back on the queue — but the worker picks its step by whether
   * the job holds a provider handle, so a job that kept one went straight back
   * to polling the attempt that had just failed. It got the same failure, three
   * times, and dead-lettered without ever asking a provider to render again.
   *
   * Every post-dispatch failure took that path, which is to say every failure
   * that actually happens in production.
   */
  it("clears the provider handle so a retry re-dispatches instead of re-polling", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await db.job.update({
      where: { id: job.id },
      data: {
        providerName: "fal",
        providerJobId: "fal_abc123",
        dispatchedAt: new Date(),
        estimatedCostUsdMicro: 40_000,
      },
    });

    expect(await fail(job.id, "the provider fell over", true)).toBe("retrying");

    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("QUEUED");
    expect(after.providerJobId).toBeNull();
    expect(after.providerName).toBeNull();
    expect(after.dispatchedAt).toBeNull();
  });

  /**
   * The daily cap is charged at dispatch. A retry dispatches again and charges
   * again, so without giving the failed attempt's estimate back, three retries
   * of one render would eat three renders' worth of the day's budget — and the
   * guard would start deferring work to protect money nobody spent.
   */
  it("hands the failed attempt's budget estimate back before retrying", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await chargeBudget(40_000);
    expect((await budgetStatus()).spentUsdMicro).toBe(40_000);

    await db.job.update({
      where: { id: job.id },
      data: {
        providerName: "fal",
        providerJobId: "fal_abc123",
        dispatchedAt: new Date(),
        estimatedCostUsdMicro: 40_000,
      },
    });

    expect(await fail(job.id, "the provider fell over", true)).toBe("retrying");

    expect((await budgetStatus()).spentUsdMicro).toBe(0);
    // Zeroed too, so the terminal path cannot refund the same estimate twice.
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.estimatedCostUsdMicro).toBe(0);
  });

  /**
   * A job that never reached a provider never charged the budget, so a retry of
   * one must not credit the day's counter for spend that did not happen.
   */
  it("leaves the budget alone when the failed attempt never dispatched", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await chargeBudget(25_000);

    expect(await fail(job.id, "could not build the request", true)).toBe("retrying");

    expect((await budgetStatus()).spentUsdMicro).toBe(25_000);
  });

  it("puts the project back to QUEUED so the bar does not sit on a stale percentage", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await db.project.update({
      where: { id: job.projectId },
      data: { status: "RUNNING", progress: 60 },
    });

    await fail(job.id, "provider hiccup", true);

    const project = await db.project.findUniqueOrThrow({ where: { id: job.projectId } });
    expect(project.status).toBe("QUEUED");
    expect(project.progress).toBe(0);
  });
});

describe("terminal transitions are exactly-once", () => {
  /**
   * A cancel racing a failure must not refund the same hold twice. The status
   * guard inside the terminal update is what prevents it; without that, a user
   * who cancels at the wrong moment gets paid.
   */
  it("refunds once when cancel and fail race", async () => {
    const user = await makeUser(500);
    const before = (await balanceOf(user)).credits;
    const job = await makeJob(user, 70);

    await Promise.allSettled([
      cancel(job.id, "user cancelled"),
      fail(job.id, "provider failed", false),
    ]);

    expect(await balanceOf(user)).toEqual({ credits: before, creditsHeld: 0 });
    await expectLedgerBalances(user);

    const refunds = await db.creditLedger.count({
      where: { userId: user, reason: "GENERATION_REFUND" },
    });
    expect(refunds).toBe(1);
  });

  it("ignores a cancel of an already-cancelled job", async () => {
    const user = await makeUser(500);
    const before = (await balanceOf(user)).credits;
    const job = await makeJob(user, 70);

    await cancel(job.id, "once");
    await cancel(job.id, "twice");

    expect((await balanceOf(user)).credits).toBe(before);
    await expectLedgerBalances(user);
  });
});

describe("crash recovery", () => {
  it("reclaims a job whose worker died holding the lease", async () => {
    const user = await makeUser(200);
    const job = await makeJob(user, 10);

    await claim("doomed-worker", 1);
    // Backdate the lease well past the default 300s window.
    await db.job.update({
      where: { id: job.id },
      data: {
        lockedAt: new Date(Date.now() - 3_600_000),
        heartbeatAt: new Date(Date.now() - 3_600_000),
      },
    });

    expect(await reclaimStale()).toBe(1);

    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("QUEUED");
    // Counting the reclaim as an attempt is what stops a job that reliably
    // kills its worker from looping forever.
    expect(after.attempts).toBe(1);
  });

  it("leaves a job whose worker is still heartbeating", async () => {
    const user = await makeUser(200);
    await makeJob(user, 10);
    await claim("healthy-worker", 1);

    expect(await reclaimStale()).toBe(0);
  });
});
