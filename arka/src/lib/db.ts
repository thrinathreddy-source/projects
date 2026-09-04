import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * The current time, as a naive timestamp in UTC.
 *
 * Always use this in raw SQL instead of `now()` when the other side of the
 * expression is a Prisma `DateTime` column. Those columns are `timestamp`
 * without a time zone and hold UTC; `now()` is a `timestamptz`, so comparing
 * the two makes Postgres convert via the *session* time zone. On a machine set
 * to Asia/Kolkata that shifted every comparison by five and a half hours, so
 * `"runAfter" <= now()` was true for jobs scheduled an hour in the future —
 * retry backoff never waited, and work deferred past the daily spend cap ran
 * immediately. Pinning the session to UTC would also fix it, but a pooler is
 * free to drop that; this is correct on its own terms. See `queue.test.ts`.
 */
export const UTC_NOW = Prisma.raw("(now() AT TIME ZONE 'UTC')");

/**
 * Single Prisma client for the process.
 *
 * Next's dev server re-evaluates modules on every hot reload, which would open
 * a new pool each time; stashing the client on `globalThis` keeps one pool.
 */

const globalForPrisma = globalThis as unknown as {
  arkaPrisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: env().isProduction ? ["error"] : ["error", "warn"],
  });
}

export const db: PrismaClient = globalForPrisma.arkaPrisma ?? createClient();

if (!env().isProduction) {
  globalForPrisma.arkaPrisma = db;
}
