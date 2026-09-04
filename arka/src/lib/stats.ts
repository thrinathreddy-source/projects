import { db } from "@/lib/db";

/**
 * Aggregates for the user-facing dashboard.
 *
 * Deliberately small: a creator cares how many clips they made, how many
 * credits are left and whether anything is stuck. Everything about margin and
 * provider cost lives in the admin surface instead.
 */

export type UserStats = {
  totalProjects: number;
  readyProjects: number;
  inProgress: number;
  failed: number;
  secondsRendered: number;
  creditsSpentThisMonth: number;
};

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function userStats(userId: string): Promise<UserStats> {
  const monthStart = startOfMonth();

  const [totalProjects, readyProjects, inProgress, failed, rendered, spent] =
    await Promise.all([
      db.project.count({ where: { userId, deletedAt: null } }),
      db.project.count({ where: { userId, deletedAt: null, status: "READY" } }),
      db.project.count({
        where: { userId, deletedAt: null, status: { in: ["QUEUED", "RUNNING"] } },
      }),
      db.project.count({ where: { userId, deletedAt: null, status: "FAILED" } }),
      db.generation.aggregate({
        where: { userId, success: true },
        _sum: { durationSec: true },
      }),
      db.creditLedger.aggregate({
        where: {
          userId,
          reason: "GENERATION_HOLD",
          createdAt: { gte: monthStart },
        },
        _sum: { delta: true },
      }),
    ]);

  return {
    totalProjects,
    readyProjects,
    inProgress,
    failed,
    secondsRendered: rendered._sum.durationSec ?? 0,
    // Holds are stored negative; report the magnitude.
    creditsSpentThisMonth: Math.abs(spent._sum.delta ?? 0),
  };
}
