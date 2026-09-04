import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Rate limiting for Arka's own endpoints.
 *
 * Better Auth limits its own routes, which covers password guessing and nothing
 * else. Everything expensive in this product sits behind endpoints it never
 * sees: creating a generation, pricing one, and above all polling a render's
 * status — which runs a full queue tick on every call, so an unthrottled poll
 * loop is not just reads, it is worker load for the entire system.
 *
 * A fixed window rather than a token bucket: the window boundary lets a caller
 * burst to 2x the limit across it, which is fine for the thing being defended
 * against here, and it costs exactly one statement with no background sweeper.
 *
 * The counter lives in Postgres for the same reason Better Auth's does — an
 * in-process counter on a serverless host is the limit multiplied by however
 * many instances happen to be warm.
 */

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  windowSec: number;
};

/**
 * The rules, in one place so the cost of each endpoint is legible next to the
 * others rather than scattered across route files.
 */
export const RATE_LIMITS = {
  /** Creating a generation. Bounded by credits too, but credits can be bought. */
  "projects.create": { limit: 20, windowSec: 60 },
  /** Buying motion or a full render — the expensive, explicit actions. */
  "projects.render": { limit: 30, windowSec: 60 },
  /** Cheap mutations: cancel, delete, re-roll. */
  "projects.mutate": { limit: 60, windowSec: 60 },
  /**
   * The progress poll. The client polls every 2s per render, and a plan may run
   * several at once, so this has to allow a genuine burst while still capping
   * a runaway loop. Every call here drives a queue tick.
   */
  "projects.status": { limit: 90, windowSec: 60 },
  /** Pricing preview. Read-only, but it hits settings and the user row. */
  estimate: { limit: 120, windowSec: 60 },
  /** Checkout creation talks to Razorpay, which has its own limits. */
  "billing.checkout": { limit: 10, windowSec: 60 },
  /** The public API, per key. Deliberately more generous than the dashboard. */
  "api.write": { limit: 60, windowSec: 60 },
  "api.read": { limit: 240, windowSec: 60 },
  /**
   * The waitlist, by IP — it is unauthenticated, so there is no user to key on.
   * Generous enough for a shared office or a mobile carrier NAT, tight enough
   * that the only public write endpoint on a closed site is not a free-for-all.
   */
  "waitlist.join": { limit: 10, windowSec: 600 },
  /** Assembling an export touches every table; it is not a hot path. */
  "account.export": { limit: 5, windowSec: 3600 },
  /** Erasure is irreversible, so this bounds a scripted mistake. */
  "account.delete": { limit: 3, windowSec: 3600 },
  /**
   * Queue ticks, globally.
   *
   * Not abuse protection — a throughput ceiling. Every request that nudges the
   * queue runs a full tick, so with enough people watching renders at once the
   * app spends its database budget on overlapping reclaim-and-claim sweeps
   * rather than on the renders themselves. A tick claims up to `batchSize`
   * jobs, so this bounds work in flight, not work done.
   */
  "queue.tick": { limit: 12, windowSec: 10 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window rolls over. */
  resetSec: number;
};

/**
 * Count one request against `name` for `subject`, and say whether it is allowed.
 *
 * The whole decision is one statement. `windowStart` doubles as the window
 * identity and the reset clock: a row whose window has elapsed is reset to 1 by
 * the same UPDATE that would otherwise have incremented it, so there is no
 * read-then-write to race and nothing to expire on a schedule.
 */
export async function consume(
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const windowMs = rule.windowSec * 1000;
  // Align windows to the epoch so every instance agrees where the boundary is.
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const key = `${name}:${subject}`;

  try {
    const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "api_rate_limit" ("key", "count", "windowStart")
      VALUES (${key}, 1, ${windowStart})
      ON CONFLICT ("key") DO UPDATE
        SET "count" = CASE
              WHEN "api_rate_limit"."windowStart" < ${windowStart} THEN 1
              ELSE "api_rate_limit"."count" + 1
            END,
            "windowStart" = GREATEST("api_rate_limit"."windowStart", ${windowStart})
      RETURNING "count", "windowStart"
    `;

    const count = rows[0]?.count ?? 1;
    const resetSec = Math.max(
      1,
      Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000),
    );

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSec,
    };
  } catch (error) {
    // Failing open is the right call: a limiter that takes the product down
    // when the database hiccups is worse than the abuse it prevents. The
    // credit balance and the daily budget cap are still underneath everything.
    logger.error("api", "Rate limit check failed, allowing the request", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, remaining: rule.limit, resetSec: rule.windowSec };
  }
}

/** `consume`, but throws the 429 the route would have had to write itself. */
export async function enforce(name: RateLimitName, subject: string): Promise<void> {
  const result = await consume(name, subject);
  if (result.allowed) return;

  throw new AppError(
    "RATE_LIMITED",
    `Too many requests. Try again in ${result.resetSec} second${
      result.resetSec === 1 ? "" : "s"
    }.`,
    { details: { retryAfterSec: result.resetSec } },
  );
}

/**
 * A non-throwing gate for things that should be skipped rather than refused.
 *
 * Used by the queue nudge: when ticks are already running as fast as they
 * usefully can, the right response is to do nothing, not to fail the user's
 * request that happened to be carrying the tick.
 */
export async function allow(name: RateLimitName, subject: string): Promise<boolean> {
  return (await consume(name, subject)).allowed;
}

/**
 * Drop counters whose window closed long ago.
 *
 * Nothing depends on this for correctness — a stale row is reset on its next
 * use — but without it the table grows one row per subject forever.
 */
export async function pruneRateLimits(olderThanHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  return db.apiRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }).then(
    (result) => result.count,
  );
}
