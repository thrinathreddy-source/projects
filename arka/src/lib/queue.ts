import type { Job, JobType, Prisma } from "@/generated/prisma/client";
import { db, UTC_NOW } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";
import { release as releaseCredits } from "@/lib/credits";
import { refundBudget } from "@/lib/budget";

/**
 * A Postgres-backed job queue.
 *
 * No Redis, no external broker. `FOR UPDATE SKIP LOCKED` gives correct
 * multi-worker claiming in one statement, and keeping jobs in the same database
 * as projects means enqueueing is part of the same transaction that creates the
 * project — a job can never reference a project that was rolled back.
 *
 * Nothing here talks to a video provider. The queue's job is claiming, leasing,
 * retrying and giving up; `src/lib/worker.ts` decides what a step actually does.
 */

export type EnqueueInput = {
  projectId: string;
  type: JobType;
  creditsHeld: number;
  priority?: number;
  /** Rejects a duplicate submit — a double-clicked Generate makes one job. */
  idempotencyKey?: string;
  payload?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
};

export async function enqueue(input: EnqueueInput): Promise<Job> {
  const settings = await getSettings();
  const client = input.tx ?? db;

  return client.job.create({
    data: {
      projectId: input.projectId,
      type: input.type,
      creditsHeld: input.creditsHeld,
      priority: input.priority ?? 0,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      maxAttempts: settings["queue.maxAttempts"],
    },
  });
}

/**
 * Claim up to `limit` jobs for this worker.
 *
 * SKIP LOCKED is the whole trick: concurrent workers running this statement
 * step over each other's locked rows instead of blocking, so throughput scales
 * with worker count and no job is ever handed to two workers.
 */
export async function claim(workerId: string, limit: number): Promise<Job[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "job"
       SET "status"      = 'RUNNING',
           "lockedBy"    = ${workerId},
           "lockedAt"    = ${UTC_NOW},
           "heartbeatAt" = ${UTC_NOW},
           "startedAt"   = COALESCE("startedAt", ${UTC_NOW}),
           "updatedAt"   = ${UTC_NOW}
     WHERE "id" IN (
       SELECT "id" FROM "job"
        WHERE "status" IN ('QUEUED', 'DEFERRED')
          AND "runAfter" <= ${UTC_NOW}
        ORDER BY "priority" DESC, "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING "id"
  `;

  if (rows.length === 0) return [];

  return db.job.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    orderBy: { priority: "desc" },
  });
}

/** Extend the lease on a job that is legitimately taking a while. */
export async function heartbeat(jobId: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { heartbeatAt: new Date() },
  });
}

/**
 * Put a job back for another step. The worker is a step function — dispatch,
 * then poll, then finish — so most steps end here rather than terminally.
 */
export async function reschedule(jobId: string, delaySec: number): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "QUEUED",
      lockedBy: null,
      lockedAt: null,
      runAfter: new Date(Date.now() + delaySec * 1000),
    },
  });
}

/** Hold a job until the daily budget resets. */
export async function defer(jobId: string, until: Date, reason: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "DEFERRED",
      lockedBy: null,
      lockedAt: null,
      runAfter: until,
      lastError: reason,
    },
  });

  await db.project.updateMany({
    where: { jobs: { some: { id: jobId } }, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "QUEUED", progress: 0 },
  });
}

export async function succeed(jobId: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      lockedBy: null,
      lockedAt: null,
      completedAt: new Date(),
      lastError: null,
    },
  });
}

/** Exponential backoff with jitter, so a provider recovering from an outage is
 *  not hit by every retry at the same instant. */
function backoffSeconds(attempts: number): number {
  const base = Math.min(300, 15 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

export type FailOutcome = "retrying" | "dead";

/**
 * Record a failed step.
 *
 * Retryable failures below the attempt ceiling go back on the queue. Everything
 * else is terminal: the project is marked failed, the reserved credits are
 * returned, and the budget estimate we charged up front is given back. A user
 * must never pay for a video they did not receive.
 */
export async function fail(
  jobId: string,
  message: string,
  retryable: boolean,
): Promise<FailOutcome> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { project: { select: { userId: true } } },
  });

  if (!job) return "dead";

  const attempts = job.attempts + 1;
  const canRetry = retryable && attempts < job.maxAttempts;

  if (canRetry) {
    /**
     * A retry has to go back to *dispatch*, not to polling.
     *
     * The worker decides which step to run by whether the job holds a provider
     * handle. Leaving one on a failed job means the next tick asks the vendor
     * about the attempt that just failed, gets the same failure back, and burns
     * the attempt ceiling without ever re-rendering — which quietly turned every
     * post-dispatch retry in this queue into a no-op. Clearing the handle is
     * what makes "retryable" mean anything.
     */
    const wasDispatched = Boolean(job.providerJobId);

    await db.job.update({
      where: { id: jobId },
      data: {
        status: "QUEUED",
        attempts,
        lockedBy: null,
        lockedAt: null,
        lastError: message,
        runAfter: new Date(Date.now() + backoffSeconds(attempts) * 1000),
        providerName: null,
        providerJobId: null,
        dispatchedAt: null,
        // The next dispatch charges the budget again, so give back what the
        // attempt that just failed was holding against the daily cap.
        estimatedCostUsdMicro: 0,
      },
    });

    if (wasDispatched) {
      await refundBudget(job.estimatedCostUsdMicro);
    }

    // A progress bar frozen at 60% on work that is starting over reads as a
    // hang. Put the project back where the job actually is.
    await db.project.updateMany({
      where: { id: job.projectId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "QUEUED", progress: 0 },
    });

    logger.warn("queue", `Job ${jobId} failed, retrying`, {
      attempts,
      maxAttempts: job.maxAttempts,
      redispatch: wasDispatched,
      message,
    });
    return "retrying";
  }

  await terminate(jobId, "FAILED", message);
  logger.error("queue", `Job ${jobId} dead-lettered`, { attempts, message });
  return "dead";
}

export async function cancel(jobId: string, reason = "Cancelled"): Promise<void> {
  await terminate(jobId, "CANCELLED", reason);
}

/**
 * Terminal transition + compensation, in one transaction.
 *
 * The status guard is what makes the refund exactly-once: a job already in a
 * terminal state updates zero rows, so a concurrent cancel and failure cannot
 * both hand back the same credits.
 */
async function terminate(
  jobId: string,
  status: "FAILED" | "CANCELLED",
  message: string,
): Promise<void> {
  const compensation = await db.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: { project: { select: { id: true, userId: true } } },
    });

    if (!job || job.status === "FAILED" || job.status === "CANCELLED" || job.status === "SUCCEEDED") {
      return null;
    }

    const updated = await tx.job.updateMany({
      where: { id: jobId, status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } },
      data: {
        status,
        lockedBy: null,
        lockedAt: null,
        completedAt: new Date(),
        lastError: message,
      },
    });

    if (updated.count === 0) return null;

    await tx.project.update({
      where: { id: job.projectId },
      data: {
        status: status === "CANCELLED" ? "CANCELLED" : "FAILED",
        errorMessage: message,
        progress: 0,
      },
    });

    return {
      userId: job.project.userId,
      credits: job.creditsHeld,
      budgetUsdMicro: job.estimatedCostUsdMicro,
    };
  });

  if (!compensation) return;

  if (compensation.credits > 0) {
    await releaseCredits(
      compensation.userId,
      compensation.credits,
      { type: "job", id: jobId },
      message,
    );
  }

  await refundBudget(compensation.budgetUsdMicro);
}

/**
 * Return jobs abandoned by a crashed worker.
 *
 * The lease is the only thing standing between a process dying mid-render and a
 * job sitting in RUNNING forever. Reclaiming counts as an attempt, so a job that
 * reliably kills its worker eventually dead-letters instead of looping.
 */
export async function reclaimStale(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings["queue.leaseSeconds"] * 1000);

  const result = await db.$executeRaw`
    UPDATE "job"
       SET "status"    = 'QUEUED',
           "attempts"  = "attempts" + 1,
           "lockedBy"  = NULL,
           "lockedAt"  = NULL,
           "runAfter"  = ${UTC_NOW},
           "lastError" = 'Worker lease expired',
           "updatedAt" = ${UTC_NOW}
     WHERE "status" = 'RUNNING'
       AND COALESCE("heartbeatAt", "lockedAt") < ${cutoff}
  `;

  if (result > 0) {
    logger.warn("queue", `Reclaimed ${result} stale job(s)`);
  }
  return result;
}

/**
 * Dead-letter jobs that have burned through their attempts via lease expiry —
 * `reclaimStale` bumps attempts but cannot itself decide to give up, since it
 * runs as a bulk statement.
 */
export async function sweepExhausted(): Promise<number> {
  const exhausted = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "job"
     WHERE "status" IN ('QUEUED', 'RUNNING')
       AND "attempts" >= "maxAttempts"
     LIMIT 50
  `;

  for (const job of exhausted) {
    await terminate(job.id, "FAILED", "Exceeded the maximum number of attempts.");
  }

  return exhausted.length;
}

export type QueueStats = {
  queued: number;
  running: number;
  deferred: number;
  failedToday: number;
};

export async function stats(): Promise<QueueStats> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [queued, running, deferred, failedToday] = await Promise.all([
    db.job.count({ where: { status: "QUEUED" } }),
    db.job.count({ where: { status: "RUNNING" } }),
    db.job.count({ where: { status: "DEFERRED" } }),
    db.job.count({ where: { status: "FAILED", completedAt: { gte: startOfDay } } }),
  ]);

  return { queued, running, deferred, failedToday };
}
