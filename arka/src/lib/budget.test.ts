import { beforeEach, describe, expect, it } from "vitest";
import { budgetStatus, chargeBudget, refundBudget, reconcileBudget } from "@/lib/budget";
import { setSetting } from "@/lib/settings";
import { resetDatabase } from "../../test/helpers";

/**
 * The budget guard is the last thing standing between a bug and a five-figure
 * vendor invoice. Its correctness is entirely in one conditional upsert, so it
 * is tested against real Postgres or not at all.
 */

beforeEach(async () => {
  await resetDatabase();
  await setSetting("budget.dailyUsdMicro", 1_000_000); // $1/day
});

describe("the daily cap", () => {
  it("charges spend against the day and reports what is left", async () => {
    expect(await chargeBudget(400_000)).toBe(true);

    const status = await budgetStatus();
    expect(status.spentUsdMicro).toBe(400_000);
    expect(status.remainingUsdMicro).toBe(600_000);
    expect(status.exhausted).toBe(false);
  });

  it("refuses a charge that would breach the cap", async () => {
    expect(await chargeBudget(900_000)).toBe(true);
    expect(await chargeBudget(200_000)).toBe(false);

    // The refused charge must leave the counter untouched.
    expect((await budgetStatus()).spentUsdMicro).toBe(900_000);
  });

  /**
   * The property that actually matters. Twenty workers dispatching at once,
   * against a cap that covers ten, must not all squeeze past the last cent —
   * the predicate lives in the `ON CONFLICT ... WHERE` clause and is evaluated
   * under the row lock, not read-then-write in application code.
   */
  it("never lets concurrent charges exceed the cap", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => chargeBudget(100_000)),
    );

    const allowed = results.filter(Boolean).length;
    expect(allowed).toBe(10);

    const status = await budgetStatus();
    expect(status.spentUsdMicro).toBe(1_000_000);
    expect(status.spentUsdMicro).toBeLessThanOrEqual(status.capUsdMicro);
  });

  it("refuses a single job larger than the entire day's budget", async () => {
    expect(await chargeBudget(5_000_000)).toBe(false);
    expect((await budgetStatus()).spentUsdMicro).toBe(0);
  });

  it("treats a zero-cost job as always affordable", async () => {
    await chargeBudget(1_000_000);
    // Mock providers cost nothing and must not be blocked by an exhausted cap.
    expect(await chargeBudget(0)).toBe(true);
  });
});

describe("reconciliation", () => {
  it("corrects the counter once the true cost is known", async () => {
    await chargeBudget(100_000);
    // Vendor actually billed more than we estimated.
    await reconcileBudget(100_000, 150_000);

    expect((await budgetStatus()).spentUsdMicro).toBe(150_000);
  });

  it("hands back an estimate charged for work that never ran", async () => {
    await chargeBudget(300_000);
    await refundBudget(300_000);

    const status = await budgetStatus();
    expect(status.spentUsdMicro).toBe(0);
    expect(status.generations).toBe(0);
  });

  it("never drives the counter negative", async () => {
    await chargeBudget(50_000);
    await refundBudget(500_000);

    expect((await budgetStatus()).spentUsdMicro).toBe(0);
  });
});
