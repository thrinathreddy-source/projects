import type { TransactionPurpose } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { deduct, grant } from "@/lib/credits";
import { getCreditPack, getPlan } from "@/lib/plans";
import { currencyForCountry, priceForCurrency, type Currency } from "@/lib/money";
import { payments, type Checkout, type CheckoutIntent } from "@/lib/payments";
import { issueInvoiceQuietly } from "@/lib/invoice";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/server-analytics";

/**
 * Billing.
 *
 * Two things matter here above all else. Money movements must be idempotent —
 * a webhook delivered twice must not grant credits twice — and credits must be
 * granted from the webhook rather than from the browser redirect, because a
 * user closing the tab after paying must still get what they paid for.
 */

export type CheckoutResult = Checkout & { transactionId: string };

export async function createCheckout(
  user: { id: string; name: string; email: string; country: string },
  intent: CheckoutIntent,
): Promise<CheckoutResult> {
  const settings = await getSettings();
  if (!settings["flags.billingEnabled"]) {
    throw new AppError("NOT_CONFIGURED", "Checkout is temporarily unavailable.");
  }

  const provider = payments();
  if (!provider.isConfigured()) {
    throw new AppError(
      "NOT_CONFIGURED",
      "Payments are not switched on yet. Write to us and we will sort you out.",
    );
  }

  const currency = currencyForCountry(user.country);

  return intent.kind === "pack"
    ? checkoutPack(user, intent.packId, currency)
    : checkoutPlan(user, intent.planCode, currency);
}

async function checkoutPack(
  user: { id: string; name: string; email: string },
  packId: string,
  currency: Currency,
): Promise<CheckoutResult> {
  const pack = getCreditPack(packId);
  if (!pack) throw notFound("That credit pack does not exist.");

  const amountMinor = priceForCurrency(pack, currency);

  const checkout = await payments().createOrder({
    user,
    intent: { kind: "pack", packId },
    amountMinor,
    currency,
    description: `${pack.credits} Arka credits`,
    notes: { userId: user.id, kind: "pack", packId },
  });

  const transaction = await db.transaction.create({
    data: {
      userId: user.id,
      provider: checkout.provider,
      purpose: "CREDIT_PACK",
      status: "CREATED",
      amountMinor,
      currency,
      creditsGranted: pack.credits,
      providerOrderId: checkout.orderId,
    },
  });

  return { ...checkout, transactionId: transaction.id };
}

async function checkoutPlan(
  user: { id: string; name: string; email: string },
  planCode: string,
  currency: Currency,
): Promise<CheckoutResult> {
  const row = await db.plan.findUnique({ where: { code: planCode } });
  const plan = getPlan(planCode);

  if (!row?.active) throw notFound("That plan is not available.");

  if (!row.providerPlanId) {
    throw new AppError(
      "NOT_CONFIGURED",
      `${plan.name} is not open for subscriptions yet. Buy a credit pack in the meantime.`,
    );
  }

  const amountMinor = priceForCurrency(row, currency);

  const checkout = await payments().createSubscription({
    user,
    intent: { kind: "plan", planCode },
    amountMinor,
    currency,
    description: `Arka ${plan.name} — monthly`,
    notes: { userId: user.id, kind: "plan", planCode },
    providerPlanId: row.providerPlanId,
  });

  const [transaction] = await db.$transaction([
    db.transaction.create({
      data: {
        userId: user.id,
        provider: checkout.provider,
        purpose: "SUBSCRIPTION",
        status: "CREATED",
        amountMinor,
        currency,
        creditsGranted: row.monthlyCredits,
        planCode,
        providerOrderId: checkout.orderId,
      },
    }),
    db.subscription.upsert({
      where: { providerSubId: checkout.orderId },
      create: {
        userId: user.id,
        planCode,
        provider: checkout.provider,
        status: "PENDING",
        providerSubId: checkout.orderId,
      },
      update: { status: "PENDING", planCode },
    }),
  ]);

  return { ...checkout, transactionId: transaction.id };
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * Grant what was paid for, exactly once.
 *
 * `fulfilledAt` is the idempotency key: the guarded `updateMany` claims the
 * transaction, and only the caller that actually flipped the row goes on to
 * grant credits. A webhook redelivered ten times grants once.
 */
export async function fulfilPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  amountMinor: number;
}): Promise<{ granted: number } | null> {
  const transaction = await db.transaction.findUnique({
    where: { providerOrderId: input.providerOrderId },
  });

  if (!transaction) {
    logger.warn("billing", "Payment for an unknown order", {
      providerOrderId: input.providerOrderId,
    });
    return null;
  }

  if (transaction.fulfilledAt) return null;

  // Refuse to fulfil an amount that does not match what we asked for — that
  // would mean either a bug or a tampered checkout.
  if (input.amountMinor !== transaction.amountMinor) {
    logger.error("billing", "Payment amount does not match the order", {
      transactionId: transaction.id,
      expected: transaction.amountMinor,
      received: input.amountMinor,
    });
    return null;
  }

  const claimed = await db.transaction.updateMany({
    where: { id: transaction.id, fulfilledAt: null },
    data: {
      status: "PAID",
      providerPaymentId: input.providerPaymentId,
      fulfilledAt: new Date(),
    },
  });

  if (claimed.count === 0) return null; // another delivery won the race

  await grant(
    transaction.userId,
    transaction.creditsGranted,
    reasonFor(transaction.purpose),
    { ref: { type: "transaction", id: transaction.id } },
  );

  if (transaction.planCode) {
    await db.user.update({
      where: { id: transaction.userId },
      data: { planCode: transaction.planCode },
    });
  }

  // A number, not a document: the invoice is rendered on demand from the row,
  // but the number has to be allocated now and never change.
  await issueInvoiceQuietly(transaction.id);

  await track(transaction.userId, "payment_succeeded", {
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    credits: transaction.creditsGranted,
    purpose: transaction.purpose,
  });

  logger.event("billing", "Fulfilled payment", {
    transactionId: transaction.id,
    credits: transaction.creditsGranted,
  });

  return { granted: transaction.creditsGranted };
}

function reasonFor(purpose: TransactionPurpose) {
  return purpose === "SUBSCRIPTION" ? "PLAN_RENEWAL" : "PACK_PURCHASE";
}

/** A recurring charge on an existing subscription. */
export async function fulfilSubscriptionCharge(input: {
  providerSubscriptionId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}): Promise<void> {
  const subscription = await db.subscription.findUnique({
    where: { providerSubId: input.providerSubscriptionId },
  });

  if (!subscription) {
    logger.warn("billing", "Charge for an unknown subscription", input);
    return;
  }

  const plan = await db.plan.findUnique({ where: { code: subscription.planCode } });
  const credits = plan?.monthlyCredits ?? getPlan(subscription.planCode).monthlyCredits;

  // One transaction row per payment id makes redelivery a no-op: the unique
  // constraint rejects the second insert.
  const existing = await db.transaction.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
  });
  if (existing) return;

  const transaction = await db.transaction.create({
    data: {
      userId: subscription.userId,
      provider: subscription.provider,
      purpose: "SUBSCRIPTION",
      status: "PAID",
      amountMinor: input.amountMinor,
      currency: input.currency,
      creditsGranted: credits,
      planCode: subscription.planCode,
      providerPaymentId: input.providerPaymentId,
      fulfilledAt: new Date(),
    },
  });

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: input.periodStart,
        currentPeriodEnd: input.periodEnd,
      },
    }),
    db.user.update({
      where: { id: subscription.userId },
      data: { planCode: subscription.planCode },
    }),
  ]);

  await grant(subscription.userId, credits, "PLAN_RENEWAL", {
    ref: { type: "transaction", id: transaction.id },
    note: `${subscription.planCode} monthly credits`,
  });

  await issueInvoiceQuietly(transaction.id);

  logger.event("billing", "Subscription renewed", {
    userId: subscription.userId,
    planCode: subscription.planCode,
    credits,
  });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundOutcome = {
  transactionId: string;
  amountMinor: number;
  /** What was actually clawed back, which may be less than what was granted. */
  creditsReversed: number;
  /** Credits the customer had already spent and cannot be taken back. */
  creditsAlreadySpent: number;
  providerRefundId: string;
  status: "processed" | "pending";
};

/**
 * Return the money and take back the credits, as one operation.
 *
 * These have to be one operation. A refund issued from the Razorpay dashboard
 * moves the money and leaves the credits sitting in the account, which is a
 * free-renders bug wearing a customer-service hat — and the refund policy page
 * was published long before any code existed to honour it.
 *
 * Order is deliberate: claim, then clawback, then call the provider. The claim
 * makes it exactly-once. The clawback happens before the money moves because
 * the reverse — money gone, credits still spendable — is the failure that costs
 * us; a clawback with a failed provider call leaves a customer with neither,
 * which is visible, loud, and fixable by hand.
 *
 * The balance is floored at zero rather than driven negative. Someone who spent
 * their credits and then asked for a refund is a support conversation about
 * whether to refund at all, not a debt to collect.
 */
export async function refundTransaction(input: {
  transactionId: string;
  reason: string;
  /** Partial refund in minor units. Omit for the full amount. */
  amountMinor?: number;
  /** Who authorised it, for the audit trail. */
  actorId: string;
}): Promise<RefundOutcome> {
  const transaction = await db.transaction.findUnique({
    where: { id: input.transactionId },
  });

  if (!transaction) throw notFound("That transaction does not exist.");

  if (transaction.status !== "PAID" || !transaction.fulfilledAt) {
    throw new AppError(
      "CONFLICT",
      "Only a paid transaction can be refunded. This one was never fulfilled.",
    );
  }

  if (!transaction.providerPaymentId) {
    throw new AppError(
      "CONFLICT",
      "This transaction has no provider payment id, so there is nothing to refund against.",
    );
  }

  const amountMinor = input.amountMinor ?? transaction.amountMinor;
  if (amountMinor <= 0 || amountMinor > transaction.amountMinor) {
    throw new AppError(
      "VALIDATION",
      `A refund must be between 1 and ${transaction.amountMinor} minor units.`,
    );
  }

  const provider = payments();
  if (!provider.isConfigured()) {
    throw new AppError("NOT_CONFIGURED", "Payments are not configured.");
  }

  // Claim it. Whoever flips `refundedAt` owns the refund; everyone else stops.
  const claimed = await db.transaction.updateMany({
    where: { id: transaction.id, refundedAt: null, status: "PAID" },
    data: { refundedAt: new Date(), refundReason: input.reason },
  });

  if (claimed.count === 0) {
    throw new AppError("CONFLICT", "This transaction has already been refunded.");
  }

  // Take back credits in proportion to the money being returned, so a partial
  // refund does not hand back the whole grant.
  const proportion = amountMinor / transaction.amountMinor;
  const target = Math.round(transaction.creditsGranted * proportion);

  let creditsReversed = 0;
  let creditsAlreadySpent = 0;

  if (target > 0) {
    const balance = await db.user.findUnique({
      where: { id: transaction.userId },
      select: { credits: true },
    });

    creditsReversed = Math.min(target, balance?.credits ?? 0);
    creditsAlreadySpent = target - creditsReversed;

    if (creditsReversed > 0) {
      await deduct(transaction.userId, creditsReversed, "PURCHASE_REVERSAL", {
        ref: { type: "transaction", id: transaction.id },
        note: input.reason,
      });

      /**
       * Record the clawback the moment it happens, not after the provider call.
       *
       * Recording it later meant a provider failure left credits deducted with
       * nothing on the row to say so — and the retry, reading a balance those
       * credits had already left, computed zero and wrote zero. The ledger was
       * right and the transaction claimed nothing had been taken back.
       *
       * Summed against the value read at the top of this call rather than with
       * `increment`, which is a no-op here: the column is nullable and starts
       * NULL, and NULL + n is NULL. The read is safe to trust because the claim
       * on `refundedAt` means only one attempt is ever in this branch.
       *
       * NULL is kept meaningful — it says no refund has been attempted, which
       * a zero would not.
       */
      await db.transaction.update({
        where: { id: transaction.id },
        data: { creditsReversed: (transaction.creditsReversed ?? 0) + creditsReversed },
      });
    }
  }

  let refund: { providerRefundId: string; amountMinor: number; status: "processed" | "pending" };
  try {
    refund = await provider.refund({
      providerPaymentId: transaction.providerPaymentId,
      amountMinor,
      reason: input.reason,
      idempotencyKey: transaction.id,
    });
  } catch (error) {
    // Release the claim so the refund can be retried. The clawback stays —
    // re-granting here would open a loop where each failed attempt hands back
    // credits that were never paid for.
    await db.transaction.updateMany({
      where: { id: transaction.id },
      data: { refundedAt: null },
    });

    logger.error("billing", "Refund failed at the provider after clawing back credits", {
      transactionId: transaction.id,
      creditsReversed,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new AppError(
      "PROVIDER_FAILED",
      "The payment provider refused the refund. Credits have been taken back; retry or refund by hand.",
    );
  }

  const fullyRefunded = amountMinor === transaction.amountMinor;

  // `creditsReversed` is deliberately absent: it was written when the clawback
  // happened, and a retry must not overwrite what an earlier attempt took.
  await db.transaction.update({
    where: { id: transaction.id },
    data: {
      status: fullyRefunded ? "REFUNDED" : "PAID",
      providerRefundId: refund.providerRefundId,
      refundAmountMinor: amountMinor,
    },
  });

  // A refunded subscription payment should not leave someone on the plan.
  if (fullyRefunded && transaction.planCode && transaction.purpose === "SUBSCRIPTION") {
    await db.user.update({
      where: { id: transaction.userId },
      data: { planCode: "free" },
    });
  }

  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: "billing.refund",
      targetType: "transaction",
      targetId: transaction.id,
      meta: { amountMinor, creditsReversed, creditsAlreadySpent, reason: input.reason },
    },
  });

  logger.event("billing", "Refunded a payment", {
    transactionId: transaction.id,
    amountMinor,
    creditsReversed,
    creditsAlreadySpent,
  });

  return {
    transactionId: transaction.id,
    amountMinor,
    creditsReversed,
    creditsAlreadySpent,
    providerRefundId: refund.providerRefundId,
    status: refund.status,
  };
}

export async function markSubscriptionCancelled(
  providerSubscriptionId: string,
): Promise<void> {
  const subscription = await db.subscription.findUnique({
    where: { providerSubId: providerSubscriptionId },
  });
  if (!subscription) return;

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    // Drop to free. Credits already granted are theirs to keep — they paid for
    // them, and clawing them back would be indefensible.
    db.user.update({
      where: { id: subscription.userId },
      data: { planCode: "free" },
    }),
  ]);

  logger.event("billing", "Subscription cancelled", { userId: subscription.userId });
}

export async function markPaymentFailed(
  providerOrderId: string,
  reason: string,
): Promise<void> {
  if (!providerOrderId) return;

  await db.transaction.updateMany({
    where: { providerOrderId, status: "CREATED" },
    data: { status: "FAILED", meta: { reason } },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function billingOverview(userId: string) {
  const [transactions, subscription] = await Promise.all([
    db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.subscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { transactions, subscription };
}
