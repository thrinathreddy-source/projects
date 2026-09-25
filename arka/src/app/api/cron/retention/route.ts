import { ok, handler } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";
import { runRetention } from "@/lib/retention";

/**
 * Nightly housekeeping: superseded previews, orphaned objects, idle cache rows,
 * old logs.
 *
 * Runs at 03:00 UTC — after the renewals sweep, and in the quietest hour for an
 * India-first product.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handler("api", async (request: Request) => {
  assertCronRequest(request);

  return ok(await runRetention());
});
