import { ok, handler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { runAlerts } from "@/lib/alerts";

/**
 * Scheduled health check.
 *
 * Deliberately separate from the worker tick: the failures worth an email are
 * exactly the ones where the worker is not running, so the check cannot live
 * inside it.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handler("alerts", async (request: Request) => {
  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${env().CRON_SECRET}`) {
    throw new AppError("FORBIDDEN", "Invalid cron credentials.");
  }

  return ok(await runAlerts());
});
