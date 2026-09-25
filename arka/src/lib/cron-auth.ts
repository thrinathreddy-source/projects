import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { secureCompare } from "@/lib/secure-compare";

/**
 * Throw unless the request carries the cron secret.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Every cron route
 * used to repeat that check with `!==`, which leaks through response timing
 * how much of a guessed secret was right. One implementation, constant-time,
 * so the next cron route cannot copy the old version.
 */
export function assertCronRequest(request: Request): void {
  const authorization = request.headers.get("authorization") ?? "";

  if (!secureCompare(authorization, `Bearer ${env().CRON_SECRET}`)) {
    throw new AppError("FORBIDDEN", "Invalid cron credentials.");
  }
}
