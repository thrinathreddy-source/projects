import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type {
  Checkout,
  CreateOrderInput,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from "@/lib/payments/types";

/**
 * Razorpay adapter.
 *
 * Chosen over Stripe because Arka is India-first: Stripe cannot accept domestic
 * Indian cards, UPI or netbanking for an India-registered business, and UPI is
 * how most of this audience actually pays. Razorpay also settles USD for
 * international cards, so global creators are covered by the same integration.
 */

let client: Razorpay | null = null;

function sdk(): Razorpay {
  if (!client) {
    const config = env();
    if (!config.hasRazorpay) {
      throw new AppError("NOT_CONFIGURED", "Payments are not set up yet.");
    }
    client = new Razorpay({
      key_id: config.RAZORPAY_KEY_ID,
      key_secret: config.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";

  isConfigured(): boolean {
    return env().hasRazorpay;
  }

  async createOrder(input: CreateOrderInput): Promise<Checkout> {
    const order = await sdk().orders.create({
      amount: input.amountMinor,
      currency: input.currency,
      // Razorpay caps receipts at 40 characters.
      receipt: `arka_${Date.now()}`.slice(0, 40),
      notes: input.notes,
    });

    return {
      provider: this.name,
      orderId: order.id,
      kind: "order",
      amountMinor: input.amountMinor,
      currency: input.currency,
      keyId: env().RAZORPAY_KEY_ID,
      description: input.description,
    };
  }

  async createSubscription(
    input: CreateOrderInput & { providerPlanId: string },
  ): Promise<Checkout> {
    const subscription = await sdk().subscriptions.create({
      plan_id: input.providerPlanId,
      // 10 years of monthly cycles. Razorpay requires a finite count; this is
      // effectively "until cancelled" without pretending it is infinite.
      total_count: 120,
      customer_notify: 1,
      notes: input.notes,
    });

    return {
      provider: this.name,
      orderId: subscription.id,
      kind: "subscription",
      amountMinor: input.amountMinor,
      currency: input.currency,
      keyId: env().RAZORPAY_KEY_ID,
      description: input.description,
    };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    // `true` = cancel at the end of the paid period, not immediately. Someone
    // who paid for this month keeps this month.
    await sdk().subscriptions.cancel(providerSubscriptionId, true);
  }

  /**
   * Return money for a captured payment.
   *
   * `speed: "normal"` rather than "optimum" on purpose: optimum attempts an
   * instant refund and charges for it, and nobody asking for their money back
   * is placated by getting it four days sooner at our expense.
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await sdk().payments.refund(input.providerPaymentId, {
      ...(input.amountMinor === undefined ? {} : { amount: input.amountMinor }),
      speed: "normal",
      notes: { reason: input.reason.slice(0, 250), transactionId: input.idempotencyKey },
      receipt: `rf_${input.idempotencyKey}`.slice(0, 40),
    });

    return {
      providerRefundId: refund.id,
      amountMinor: Number(refund.amount),
      // Razorpay reports "processed" once settled and "pending" while in
      // flight. Both mean the instruction was accepted.
      status: refund.status === "processed" ? "processed" : "pending",
    };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    // Constant-time compare; a length mismatch is itself a mismatch.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    let payload: RazorpayWebhook;
    try {
      payload = JSON.parse(rawBody) as RazorpayWebhook;
    } catch {
      return { type: "ignored", reason: "Unparseable webhook body." };
    }

    const payment = payload.payload?.payment?.entity;
    const subscription = payload.payload?.subscription?.entity;

    switch (payload.event) {
      case "payment.captured":
        if (!payment?.order_id) {
          return { type: "ignored", reason: "Capture without an order id." };
        }
        return {
          type: "payment.succeeded",
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          amountMinor: payment.amount,
          currency: payment.currency,
          notes: payment.notes ?? {},
        };

      case "payment.failed":
        return {
          type: "payment.failed",
          providerOrderId: payment?.order_id ?? "",
          providerPaymentId: payment?.id ?? null,
          reason: payment?.error_description ?? "Payment failed.",
        };

      case "subscription.charged":
        if (!subscription?.id || !payment?.id) {
          return { type: "ignored", reason: "Incomplete subscription charge." };
        }
        return {
          type: "subscription.charged",
          providerSubscriptionId: subscription.id,
          providerPaymentId: payment.id,
          amountMinor: payment.amount,
          currency: payment.currency,
          periodStart: toDate(subscription.current_start),
          periodEnd: toDate(subscription.current_end),
          notes: subscription.notes ?? {},
        };

      case "subscription.cancelled":
      case "subscription.completed":
        if (!subscription?.id) {
          return { type: "ignored", reason: "Cancellation without a subscription id." };
        }
        return {
          type: "subscription.cancelled",
          providerSubscriptionId: subscription.id,
        };

      default:
        return { type: "ignored", reason: `Unhandled event "${payload.event}".` };
    }
  }
}

/** Razorpay timestamps are Unix seconds. */
function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/** The subset of Razorpay's webhook envelope this adapter reads. */
type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id?: string;
        amount: number;
        currency: string;
        notes?: Record<string, string>;
        error_description?: string;
      };
    };
    subscription?: {
      entity?: {
        id: string;
        current_start?: number | null;
        current_end?: number | null;
        notes?: Record<string, string>;
      };
    };
  };
};
