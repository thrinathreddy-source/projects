import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { db } from "@/lib/db";
import { grant } from "@/lib/credits";

/** Wipe every table between tests. Order does not matter under CASCADE. */
export async function resetDatabase() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "credit_ledger", "generation", "job", "video", "project",
      "transaction", "subscription", "api_key", "feedback",
      "audit_log", "system_log", "render_cache", "daily_spend", "review_item",
      "waitlist_entry", "grievance",
      "app_setting", "api_rate_limit", "session", "account", "user"
    RESTART IDENTITY CASCADE
  `);
}

/**
 * A user with a known opening balance.
 *
 * The balance is granted through the ledger rather than written straight onto
 * the row. Setting `credits` directly would leave SUM(delta) != credits before
 * a single line of code under test had run, which makes the invariant
 * unassertable — the first version of this helper did exactly that and produced
 * three confusing failures.
 */
export async function makeUser(credits = 1_000) {
  const id = randomUUID();
  await db.user.create({
    data: { id, name: "Test", email: `${id}@example.test`, emailVerified: true },
  });
  if (credits > 0) await grant(id, credits, "SIGNUP_GRANT");
  return id;
}

export async function makeProject(userId: string) {
  const project = await db.project.create({
    data: {
      userId,
      title: "Test",
      prompt: "a test shot that is long enough to pass validation",
      style: "mythic",
      setting: "dravidian",
    },
  });
  return project.id;
}

/** The ledger's core invariant, asserted directly against the database. */
export async function ledgerSum(userId: string): Promise<number> {
  const result = await db.creditLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

export async function balanceOf(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true, creditsHeld: true },
  });
  return user;
}

/**
 * The invariant, as a one-liner so every test can end with it.
 *
 * If this ever fails, the cached balance and the ledger have diverged and the
 * ledger is no longer the record of what happened.
 */
export async function expectLedgerBalances(userId: string) {
  const { credits } = await balanceOf(userId);
  expect(await ledgerSum(userId)).toBe(credits);
}
