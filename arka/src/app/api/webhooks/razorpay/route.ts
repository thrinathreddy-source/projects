import { NextResponse } from "next/server";
import { payments } from "@/lib/payments";
import {
  fulfilPayment,
  fulfilSubscriptionCharge,
  markPaymentFailed,
  markSubscriptionCancelled,
} from "@/lib/billing";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook.
 *
 * This is the authoritative moment a purchase becomes real — not the browser
 * redirect, which a user can close, block or never reach. Fulfilment is driven
 * from here so someone who pays and immediately shuts their laptop still gets
 * their credits.
 *
 * Deliberately does not use the shared `handler` wrapper: it needs the raw
 * request body for signature verification, and it must answer 200 to anything
 * it has already processed so Razorpay stops retrying.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  const provider = payments();

  if (!provider.verifyWebhook(rawBody, signature)) {
    logger.warn("webhook", "Rejected a Razorpay webhook with a bad signature");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = provider.parseWebhook(rawBody);

  try {
    switch (event.type) {
      case "payment.succeeded":
        await fulfilPayment({
          providerOrderId: event.providerOrderId,
          providerPaymentId: event.providerPaymentId,
          amountMinor: event.amountMinor,
        });
        break;

      case "payment.failed":
        await markPaymentFailed(event.providerOrderId, event.reason);
        break;

      case "subscription.charged":
        await fulfilSubscriptionCharge({
          providerSubscriptionId: event.providerSubscriptionId,
          providerPaymentId: event.providerPaymentId,
          amountMinor: event.amountMinor,
          currency: event.currency,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
        });
        break;

      case "subscription.cancelled":
        await markSubscriptionCancelled(event.providerSubscriptionId);
        break;

      case "ignored":
        break;
    }
  } catch (error) {
    // A 500 makes Razorpay retry, which is what we want for a transient
    // failure — but log loudly, because a stuck webhook means someone paid and
    // did not get their credits.
    logger.error("webhook", "Failed to process a Razorpay event", {
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
