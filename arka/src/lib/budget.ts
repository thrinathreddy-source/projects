import { db, UTC_NOW } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { logger } from "@/lib/logger";

/**
 * The daily spend guard.
 *
 * A bug, an abusive account or a viral post can each turn "cheap per clip" into
 * a five-figure invoice overnight. This caps provider spend per UTC day; past
 * the cap, jobs are deferred to tomorrow rather than run. Deferring beats
 * failing — the user keeps their place and their credits, and we keep the
 * business.
 */

function today(): Date {
  const now = new Date();
  // Postgres DATE column — normalise to UTC midnight so the key is stable
  // regardless of the server's timezone.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Next UTC midnight — when a deferred job becomes eligible again. */
export function nextBudgetWindow(): Date {
  const day = today();
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

export type BudgetStatus = {
  spentUsdMicro: number;
  capUsdMicro: number;
  remainingUsdMicro: number;
  generations: number;
  exhausted: boolean;
  resetsAt: Date;
};

export async function budgetStatus(): Promise<BudgetStatus> {
  const capUsdMicro = await getSetting("budget.dailyUsdMicro");
  const row = await db.dailySpend.findUnique({ where: { day: today() } });

  const spentUsdMicro = row?.costUsdMicro ?? 0;

  return {
    spentUsdMicro,
    capUsdMicro,
    remainingUsdMicro: Math.max(0, capUsdMicro - spentUsdMicro),
    generations: row?.generations ?? 0,
    exhausted: spentUsdMicro >= capUsdMicro,
    resetsAt: nextBudgetWindow(),
  };
}

/**
 * Atomically charge the day's budget, refusing if it would breach the cap.
 *
 * Returns false when there is no room left. The conditional `ON CONFLICT ...
 * WHERE` is what makes this safe under concurrency: two workers dispatching at
 * once cannot both squeeze past the last few cents, because the predicate is
 * evaluated against the row they are each locking.
 */
export async function chargeBudget(costUsdMicro: number): Promise<boolean> {
  if (costUsdMicro <= 0) return true;

  const capUsdMicro = await getSetting("budget.dailyUsdMicro");

  // A single job costing more than the whole day's budget can never run; let it
  // through rather than wedging the queue forever, but say so loudly.
  if (costUsdMicro > capUsdMicro) {
    logger.warn("queue", "A single job exceeds the entire daily budget", {
      costUsdMicro,
      capUsdMicro,
    });
    return false;
  }

  const affected = await db.$executeRaw`
    INSERT INTO daily_spend ("day", "costUsdMicro", "generations", "updatedAt")
    VALUES (${today()}::date, ${costUsdMicro}, 1, ${UTC_NOW})
    ON CONFLICT ("day") DO UPDATE
      SET "costUsdMicro" = daily_spend."costUsdMicro" + ${costUsdMicro},
          "generations"  = daily_spend."generations" + 1,
          "updatedAt"    = ${UTC_NOW}
      WHERE daily_spend."costUsdMicro" + ${costUsdMicro} <= ${capUsdMicro}
  `;

  if (affected === 0) {
    logger.warn("queue", "Daily provider budget exhausted — deferring work", {
      capUsdMicro,
      costUsdMicro,
    });
    return false;
  }

  return true;
}

/**
 * Correct the day's counter once the true cost is known.
 *
 * We charge an estimate up front (that is what makes the cap a real guard) and
 * reconcile here, so the number an admin sees converges on the actual invoice.
 */
export async function reconcileBudget(
  estimatedUsdMicro: number,
  actualUsdMicro: number,
): Promise<void> {
  const delta = actualUsdMicro - estimatedUsdMicro;
  if (delta === 0) return;

  await db.$executeRaw`
    UPDATE daily_spend
       SET "costUsdMicro" = GREATEST(0, "costUsdMicro" + ${delta}),
           "updatedAt" = ${UTC_NOW}
     WHERE "day" = ${today()}::date
  `;
}

/** Give back an estimate that was charged for work that never ran. */
export async function refundBudget(costUsdMicro: number): Promise<void> {
  if (costUsdMicro <= 0) return;

  await db.$executeRaw`
    UPDATE daily_spend
       SET "costUsdMicro" = GREATEST(0, "costUsdMicro" - ${costUsdMicro}),
           "generations"  = GREATEST(0, "generations" - 1),
           "updatedAt" = ${UTC_NOW}
     WHERE "day" = ${today()}::date
  `;
}

/** Trailing spend history for the admin dashboard. */
export async function spendHistory(days = 30) {
  const since = new Date(today().getTime() - days * 24 * 60 * 60 * 1000);
  return db.dailySpend.findMany({
    where: { day: { gte: since } },
    orderBy: { day: "asc" },
  });
}
