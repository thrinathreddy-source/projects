import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { payments } from "@/lib/payments";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Cancel at period end.
 *
 * Deliberately not immediate: someone who has paid for this month keeps this
 * month. The plan drops to free when the provider confirms via webhook.
 */
export const DELETE = handler("billing", async () => {
  const user = await requireUser();

  const subscription = await db.subscription.findFirst({
    where: { userId: user.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription?.providerSubId) {
    throw new AppError("NOT_FOUND", "You do not have an active subscription.");
  }

  await payments().cancelSubscription(subscription.providerSubId);

  await db.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: true },
  });

  logger.event("billing", "Subscription cancellation requested", { userId: user.id });

  return ok({
    cancelAtPeriodEnd: true,
    activeUntil: subscription.currentPeriodEnd,
  });
});
