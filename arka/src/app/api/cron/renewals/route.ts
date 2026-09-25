import { ok, handler } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily subscription housekeeping.
 *
 * Credit grants happen on the `subscription.charged` webhook, not here — this
 * only expires subscriptions the provider stopped renewing, so somebody whose
 * card lapsed three weeks ago is not still on a paid plan.
 */
export const GET = handler("billing", async (request: Request) => {
  assertCronRequest(request);

  // A grace window past the period end, so a renewal that is merely slow does
  // not lock somebody out of the plan they are paying for.
  const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const lapsed = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      currentPeriodEnd: { lt: graceCutoff },
    },
    select: { id: true, userId: true },
  });

  for (const subscription of lapsed) {
    await db.$transaction([
      db.subscription.update({
        where: { id: subscription.id },
        data: { status: "EXPIRED" },
      }),
      db.user.update({
        where: { id: subscription.userId },
        data: { planCode: "free" },
      }),
    ]);
  }

  if (lapsed.length > 0) {
    logger.event("billing", `Expired ${lapsed.length} lapsed subscription(s)`);
  }

  return ok({ expired: lapsed.length });
});
