import { db, UTC_NOW } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { budgetStatus } from "@/lib/budget";
import { sendMail } from "@/lib/mailer";
import { logger } from "@/lib/logger";

/**
 * The smallest monitoring that is honest.
 *
 * A generation failing is not an emergency — jobs retry, credits come back, and
 * the user is told. What matters is the difference between one render failing
 * and *renders* failing: a provider that has started refusing everything, a
 * queue nothing is draining, a budget that quietly stopped all work. Those look
 * identical from the outside — the site is up, the dashboard loads, and nothing
 * generates — so they need to arrive in an inbox rather than wait to be noticed.
 *
 * No third-party monitoring service. The signals are all queries against data
 * we already keep, and the delivery is the mailer we already have.
 */

export type Severity = "warn" | "critical";

export type Signal = {
  /** Stable identity for the alert, used for the resend cooldown. */
  key: string;
  severity: Severity;
  summary: string;
  detail: string;
};

/** How long before the same alert is allowed to mail again. */
const COOLDOWN_MINUTES = 60;

/** A queue nobody is draining is only alarming once it has been ignored a while. */
const STALLED_AFTER_MINUTES = 15;

/** Below this many finished jobs, a failure rate is noise rather than signal. */
const MIN_SAMPLE = 5;
const FAILURE_RATE_THRESHOLD = 0.5;

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

/**
 * Work that is ready to run and has not been picked up.
 *
 * This is the one that catches a dead scheduler. Everything else can be
 * healthy — the app serving, the database up — while no video is produced,
 * because nothing is calling the worker.
 */
async function stalledQueue(): Promise<Signal | null> {
  const [row] = await db.$queryRaw<{ count: bigint; oldest: Date | null }[]>`
    SELECT COUNT(*) AS count, MIN("runAfter") AS oldest
      FROM "job"
     WHERE "status" IN ('QUEUED', 'DEFERRED')
       AND "runAfter" <= ${UTC_NOW} - make_interval(mins => ${STALLED_AFTER_MINUTES})
  `;

  const count = Number(row?.count ?? 0);
  if (count === 0) return null;

  const waited = row?.oldest
    ? Math.round((Date.now() - row.oldest.getTime()) / 60_000)
    : STALLED_AFTER_MINUTES;

  return {
    key: "queue.stalled",
    severity: "critical",
    summary: `${count} job(s) ready to run but not picked up`,
    detail:
      `The oldest has been waiting ${waited} minutes. Jobs become eligible and ` +
      `are then claimed by /api/cron/worker, so this usually means the cron is ` +
      `not firing or every tick is failing before it claims anything.`,
  };
}

/** Jobs held past their lease — a worker died mid-render, or is wedged. */
async function abandonedJobs(): Promise<Signal | null> {
  const settings = await getSettings();
  // Two full leases: one is normal (reclaimStale has not run yet), two is not.
  const cutoff = new Date(Date.now() - settings["queue.leaseSeconds"] * 2_000);

  const count = await db.job.count({
    where: {
      status: "RUNNING",
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, lockedAt: { lt: cutoff } }],
    },
  });

  if (count === 0) return null;

  return {
    key: "queue.abandoned",
    severity: "warn",
    summary: `${count} job(s) held past their lease`,
    detail:
      `These are claimed but no longer heartbeating. reclaimStale() should be ` +
      `returning them to the queue; if the number is not falling, the worker is ` +
      `claiming work and then dying before it can make progress.`,
  };
}

/** Most of what finished recently, failed. */
async function failureRate(): Promise<Signal | null> {
  const since = minutesAgo(60);

  const [failed, succeeded] = await Promise.all([
    db.job.count({ where: { status: "FAILED", completedAt: { gte: since } } }),
    db.job.count({ where: { status: "SUCCEEDED", completedAt: { gte: since } } }),
  ]);

  const total = failed + succeeded;
  if (total < MIN_SAMPLE) return null;

  const rate = failed / total;
  if (rate < FAILURE_RATE_THRESHOLD) return null;

  return {
    key: "generation.failureRate",
    severity: "critical",
    summary: `${Math.round(rate * 100)}% of generations failed in the last hour`,
    detail:
      `${failed} failed against ${succeeded} succeeded. Credits are refunded on ` +
      `every one of these, so the cost is trust rather than money. Check provider ` +
      `health and the recent errors in the admin log.`,
  };
}

/** Every configured provider is disabled, so nothing can be generated at all. */
async function providersDown(): Promise<Signal | null> {
  const configured = env().videoProviders;
  if (configured.length === 0) return null;

  const healthy = await db.providerHealth.count({
    where: {
      name: { in: configured },
      healthy: true,
      OR: [{ disabledUntil: null }, { disabledUntil: { lt: new Date() } }],
    },
  });

  // A provider with no health row yet has never failed, so it counts as usable.
  const known = await db.providerHealth.count({ where: { name: { in: configured } } });
  const usable = healthy + (configured.length - known);
  if (usable > 0) return null;

  return {
    key: "provider.allDown",
    severity: "critical",
    summary: "Every video provider is disabled",
    detail:
      `All of ${configured.join(", ")} are marked unhealthy, so the router has ` +
      `nothing to dispatch to and new work will fail or defer.`,
  };
}

/** The daily cap is spent, so everything from here is deferred to tomorrow. */
async function budgetExhausted(): Promise<Signal | null> {
  const status = await budgetStatus();
  if (!status.exhausted) return null;

  const deferred = await db.job.count({ where: { status: "DEFERRED" } });

  return {
    key: "budget.exhausted",
    severity: "warn",
    summary: "Daily provider budget is spent",
    detail:
      `$${(status.spentUsdMicro / 1_000_000).toFixed(2)} of ` +
      `$${(status.capUsdMicro / 1_000_000).toFixed(2)} used across ` +
      `${status.generations} generation(s). ${deferred} job(s) are waiting for ` +
      `tomorrow. This is the guard working as designed — raise the cap only if ` +
      `the day's gross margin justifies it.`,
  };
}

/**
 * A burst of unhandled server errors.
 *
 * Every other signal here describes a specific failure we predicted. This one
 * is the opposite: it catches the failures nobody wrote a check for, now that
 * `instrumentation.ts` routes every uncaught server error into `system_log`.
 * A trickle is normal on any site with crawlers and stale tabs; a spike is a
 * deploy that went wrong.
 */
const ERROR_SPIKE_THRESHOLD = 25;

async function errorSpike(): Promise<Signal | null> {
  const since = minutesAgo(15);

  const count = await db.systemLog.count({
    where: { level: "error", createdAt: { gte: since } },
  });

  if (count < ERROR_SPIKE_THRESHOLD) return null;

  const [top] = await db.systemLog.groupBy({
    by: ["message"],
    where: { level: "error", createdAt: { gte: since } },
    _count: { message: true },
    orderBy: { _count: { message: "desc" } },
    take: 1,
  });

  return {
    key: "app.errorSpike",
    severity: "critical",
    summary: `${count} server errors in 15 minutes`,
    detail:
      `Most frequent: ${top?.message ?? "unknown"} (${top?._count.message ?? 0}). ` +
      `This counts uncaught errors as well as logged ones, so a spike straight ` +
      `after a deploy usually means the deploy. Admin → Logs has the detail.`,
  };
}

export async function collectSignals(): Promise<Signal[]> {
  const checks = await Promise.all([
    stalledQueue(),
    abandonedJobs(),
    failureRate(),
    providersDown(),
    budgetExhausted(),
    errorSpike(),
  ]);

  const order: Record<Severity, number> = { critical: 0, warn: 1 };
  return checks
    .filter((signal): signal is Signal => signal !== null)
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Claim the right to mail about a signal.
 *
 * A stuck queue is still stuck on the next tick, so without this an outage
 * would send an email every few minutes and train us to ignore them. The claim
 * is a conditional upsert rather than a read-then-write, so two overlapping
 * ticks cannot both decide they are the one to send.
 */
async function claimCooldown(key: string): Promise<boolean> {
  const settingKey = `alert.lastSent.${key}`;

  const affected = await db.$executeRaw`
    INSERT INTO app_setting ("key", "value", "updatedAt")
    VALUES (${settingKey}, to_jsonb(extract(epoch from ${UTC_NOW})), ${UTC_NOW})
    ON CONFLICT ("key") DO UPDATE
      SET "value" = to_jsonb(extract(epoch from ${UTC_NOW})),
          "updatedAt" = ${UTC_NOW}
      WHERE (app_setting."value")::numeric
            < extract(epoch from ${UTC_NOW}) - ${COOLDOWN_MINUTES * 60}
  `;

  return affected > 0;
}

export type AlertRun = {
  signals: Signal[];
  mailed: string[];
  suppressed: string[];
};

/**
 * Check everything, and mail the admins about whatever is both wrong and not
 * already reported. Safe to call on a schedule.
 */
export async function runAlerts(): Promise<AlertRun> {
  const signals = await collectSignals();
  const mailed: string[] = [];
  const suppressed: string[] = [];

  for (const signal of signals) {
    logger[signal.severity === "critical" ? "error" : "warn"](
      "queue",
      `Alert: ${signal.summary}`,
      { key: signal.key },
    );

    if (await claimCooldown(signal.key)) mailed.push(signal.key);
    else suppressed.push(signal.key);
  }

  const toMail = signals.filter((signal) => mailed.includes(signal.key));
  const recipients = env().adminEmails;

  if (toMail.length > 0 && recipients.length > 0) {
    const critical = toMail.some((signal) => signal.severity === "critical");

    await sendMail({
      to: recipients.join(", "),
      subject: `${critical ? "[Arka] Something is broken" : "[Arka] Worth a look"}: ${toMail[0].summary}`,
      text: [
        critical
          ? "One or more things are wrong that stop videos being produced."
          : "Nothing is broken, but this is worth knowing about.",
        "",
        ...toMail.flatMap((signal) => [
          `${signal.severity.toUpperCase()} — ${signal.summary}`,
          signal.detail,
          "",
        ]),
        `${env().BETTER_AUTH_URL}/admin`,
        "",
        `You will not be told about the same thing again for ${COOLDOWN_MINUTES} minutes.`,
        "",
        "— Arka",
      ].join("\n"),
    });
  }

  return { signals, mailed, suppressed };
}
