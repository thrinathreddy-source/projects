import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";
import { grant, deduct } from "@/lib/credits";
import { budgetStatus, spendHistory } from "@/lib/budget";
import { stats as queueStats } from "@/lib/queue";
import { providerHealthReport } from "@/lib/providers";

/**
 * Admin analytics.
 *
 * The number that matters is not MRR or signups — it is gross profit per
 * generated minute. If every minute of video we produce is profitable after the
 * provider bill, payment fees and storage, then growth is a good thing. If it
 * is not, growth is just a faster way to run out of money. Everything here
 * exists to answer that one question, and to show which users, providers and
 * plans move it.
 */

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Normalise a revenue figure to USD micros so one number covers both currencies. */
function toUsdMicro(amountMinor: number, currency: string, inrPerUsd: number): number {
  // amountMinor is paise or cents — hundredths of the major unit.
  const major = amountMinor / 100;
  const usd = currency === "INR" ? major / inrPerUsd : major;
  return Math.round(usd * 1_000_000);
}

export type UnitEconomics = {
  /** Everything in USD micros. */
  revenueUsdMicro: number;
  paymentFeesUsdMicro: number;
  providerCostUsdMicro: number;
  overheadUsdMicro: number;
  grossProfitUsdMicro: number;

  secondsGenerated: number;
  minutesGenerated: number;
  /** The headline metric. */
  grossProfitPerMinuteUsdMicro: number;
  /** Gross margin as a fraction of revenue; null when there is no revenue yet. */
  grossMargin: number | null;

  generations: number;
  successfulGenerations: number;
  cacheHits: number;
  successRate: number;
  cacheHitRate: number;
};

export async function unitEconomics(days = 30): Promise<UnitEconomics> {
  const settings = await getSettings();
  const from = since(days);

  const [transactions, generations] = await Promise.all([
    db.transaction.findMany({
      where: { status: "PAID", createdAt: { gte: from } },
      select: { amountMinor: true, currency: true },
    }),
    db.generation.findMany({
      where: { createdAt: { gte: from } },
      select: {
        costUsdMicro: true,
        durationSec: true,
        success: true,
        cacheHit: true,
      },
    }),
  ]);

  const revenueUsdMicro = transactions.reduce(
    (total, row) =>
      total + toUsdMicro(row.amountMinor, row.currency, settings["fx.inrPerUsd"]),
    0,
  );

  const paymentFeesUsdMicro = Math.round(
    revenueUsdMicro * (settings["costs.paymentFeePercent"] / 100),
  );

  const providerCostUsdMicro = generations.reduce(
    (total, row) => total + row.costUsdMicro,
    0,
  );

  const successful = generations.filter((row) => row.success);
  const secondsGenerated = successful.reduce(
    (total, row) => total + (row.durationSec ?? 0),
    0,
  );
  const minutesGenerated = secondsGenerated / 60;

  const overheadUsdMicro = Math.round(
    minutesGenerated * settings["costs.overheadPerMinuteUsdMicro"],
  );

  const grossProfitUsdMicro =
    revenueUsdMicro - paymentFeesUsdMicro - providerCostUsdMicro - overheadUsdMicro;

  const cacheHits = generations.filter((row) => row.cacheHit).length;

  return {
    revenueUsdMicro,
    paymentFeesUsdMicro,
    providerCostUsdMicro,
    overheadUsdMicro,
    grossProfitUsdMicro,

    secondsGenerated,
    minutesGenerated,
    grossProfitPerMinuteUsdMicro:
      minutesGenerated > 0 ? Math.round(grossProfitUsdMicro / minutesGenerated) : 0,
    grossMargin: revenueUsdMicro > 0 ? grossProfitUsdMicro / revenueUsdMicro : null,

    generations: generations.length,
    successfulGenerations: successful.length,
    cacheHits,
    successRate: generations.length > 0 ? successful.length / generations.length : 1,
    cacheHitRate: generations.length > 0 ? cacheHits / generations.length : 0,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof overview>>;

export async function overview(days = 30) {
  const from = since(days);

  const [
    economics,
    totalUsers,
    newUsers,
    payingUsers,
    projects,
    queue,
    budget,
    providers,
    spend,
    openFeedback,
  ] = await Promise.all([
    unitEconomics(days),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: from } } }),
    db.user.count({ where: { planCode: { not: "free" } } }),
    db.project.count({ where: { deletedAt: null, createdAt: { gte: from } } }),
    queueStats(),
    budgetStatus(),
    providerHealthReport(),
    spendHistory(days),
    db.feedback.count({ where: { resolved: false } }),
  ]);

  return {
    economics,
    users: { total: totalUsers, new: newUsers, paying: payingUsers },
    projects,
    queue,
    budget,
    providers,
    spend,
    openFeedback,
  };
}

/** Per-provider cost and reliability, for deciding who to route to. */
export async function providerBreakdown(days = 30) {
  const rows = await db.generation.groupBy({
    by: ["provider", "model"],
    where: { createdAt: { gte: since(days) } },
    _count: { _all: true },
    _sum: { costUsdMicro: true, durationSec: true },
    _avg: { latencyMs: true },
  });

  const failures = await db.generation.groupBy({
    by: ["provider"],
    where: { createdAt: { gte: since(days) }, success: false },
    _count: { _all: true },
  });

  const failureByProvider = new Map(
    failures.map((row) => [row.provider, row._count._all]),
  );

  return rows
    .map((row) => {
      const seconds = row._sum.durationSec ?? 0;
      const cost = row._sum.costUsdMicro ?? 0;
      const count = row._count._all;

      return {
        provider: row.provider,
        model: row.model,
        generations: count,
        failures: failureByProvider.get(row.provider) ?? 0,
        secondsGenerated: seconds,
        costUsdMicro: cost,
        costPerSecondUsdMicro: seconds > 0 ? Math.round(cost / seconds) : 0,
        avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
      };
    })
    .sort((a, b) => b.generations - a.generations);
}

/** Recent failures — the fastest way to notice a provider has changed under us. */
export async function recentFailures(limit = 50) {
  return db.generation.findMany({
    where: { success: false },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { email: true } },
      project: { select: { id: true, title: true, style: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(options: {
  search?: string;
  cursor?: string;
  limit: number;
}) {
  const rows = await db.user.findMany({
    where: options.search
      ? {
          OR: [
            { email: { contains: options.search, mode: "insensitive" } },
            { name: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      credits: true,
      creditsHeld: true,
      planCode: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  });

  return rows;
}

export type UserEconomics = {
  revenueUsdMicro: number;
  costUsdMicro: number;
  marginUsdMicro: number;
  generations: number;
  secondsGenerated: number;
};

/**
 * What a set of users has paid us versus cost us.
 *
 * Batched over the whole page rather than queried per row: this is the answer
 * to "who makes us money and who costs us money", and it is worth having on
 * the users table itself — but not at the price of an N+1 on every page load.
 */
export async function economicsFor(
  userIds: string[],
): Promise<Map<string, UserEconomics>> {
  const result = new Map<string, UserEconomics>();
  if (userIds.length === 0) return result;

  const settings = await getSettings();

  const [revenue, generations] = await Promise.all([
    db.transaction.findMany({
      where: { userId: { in: userIds }, status: "PAID" },
      select: { userId: true, amountMinor: true, currency: true },
    }),
    db.generation.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { costUsdMicro: true, durationSec: true },
      _count: { _all: true },
    }),
  ]);

  const revenueByUser = new Map<string, number>();
  for (const row of revenue) {
    revenueByUser.set(
      row.userId,
      (revenueByUser.get(row.userId) ?? 0) +
        toUsdMicro(row.amountMinor, row.currency, settings["fx.inrPerUsd"]),
    );
  }

  const costByUser = new Map(generations.map((row) => [row.userId, row]));

  for (const userId of userIds) {
    const revenueUsdMicro = revenueByUser.get(userId) ?? 0;
    const usage = costByUser.get(userId);
    const costUsdMicro = usage?._sum.costUsdMicro ?? 0;

    result.set(userId, {
      revenueUsdMicro,
      costUsdMicro,
      marginUsdMicro: revenueUsdMicro - costUsdMicro,
      generations: usage?._count._all ?? 0,
      secondsGenerated: usage?._sum.durationSec ?? 0,
    });
  }

  return result;
}

export async function setBanned(
  actorId: string,
  userId: string,
  banned: boolean,
  reason?: string,
) {
  if (actorId === userId) {
    throw new Error("You cannot ban yourself.");
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        banned,
        banReason: banned ? (reason ?? "Terms violation") : null,
        banExpires: null,
      },
    }),
    // Ending their sessions is the point of a ban; leaving them signed in
    // would make it decorative.
    ...(banned ? [db.session.deleteMany({ where: { userId } })] : []),
    db.auditLog.create({
      data: {
        actorId,
        action: banned ? "user.ban" : "user.unban",
        targetType: "user",
        targetId: userId,
        meta: reason ? { reason } : undefined,
      },
    }),
  ]);

  logger.event("admin", banned ? "User banned" : "User unbanned", { userId, actorId });
}

export async function adjustCredits(
  actorId: string,
  userId: string,
  delta: number,
  note: string,
) {
  if (delta === 0) return;

  if (delta > 0) {
    await grant(userId, delta, "ADMIN_GRANT", { note });
  } else {
    await deduct(userId, Math.abs(delta), "ADMIN_DEDUCT", { note });
  }

  await db.auditLog.create({
    data: {
      actorId,
      action: delta > 0 ? "credits.grant" : "credits.deduct",
      targetType: "user",
      targetId: userId,
      meta: { delta, note },
    },
  });

  logger.event("admin", "Credits adjusted", { userId, delta, actorId });
}

export async function auditTrail(limit = 50) {
  return db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { email: true } } },
  });
}
