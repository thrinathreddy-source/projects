import { ok, handler } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
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
  if (request.headers.get("authorization") !== `Bearer ${env().CRON_SECRET}`) {
    throw new AppError("FORBIDDEN", "Invalid cron credentials.");
  }

  return ok(await runRetention());
});
