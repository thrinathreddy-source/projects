import { ok, handler } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";
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
  assertCronRequest(request);

  return ok(await runAlerts());
});
