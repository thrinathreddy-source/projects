/**
 * The payment contract.
 *
 * Razorpay is the right default for an India-first product — it settles INR
 * domestically and accepts UPI, which Stripe cannot do for an Indian entity.
 * But payment providers are exactly the kind of dependency you regret hardcoding
 * the day you incorporate somewhere else, so the app only ever sees this
 * interface. Adding Stripe later is a new file in this directory.
 */

export type Currency = "INR" | "USD";

export type CheckoutIntent =
  | { kind: "pack"; packId: string }
  | { kind: "plan"; planCode: string };

export type CreateOrderInput = {
  user: { id: string; name: string; email: string };
  intent: CheckoutIntent;
  amountMinor: number;
  currency: Currency;
  /** Human description shown on the provider's checkout sheet. */
  description: string;
  /** Echoed back on the webhook so fulfilment knows what was bought. */
  notes: Record<string, string>;
};

/** Everything the browser needs to open the provider's checkout. */
export type Checkout = {
  provider: string;
  /** Razorpay order id, or subscription id when `kind` is "subscription". */
  orderId: string;
  kind: "order" | "subscription";
  amountMinor: number;
  currency: Currency;
  /** Publishable key id for the client SDK. */
  keyId: string;
  description: string;
};

export type WebhookEvent =
  | {
      type: "payment.succeeded";
      providerOrderId: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      notes: Record<string, string>;
    }
  | {
      type: "payment.failed";
      providerOrderId: string;
      providerPaymentId: string | null;
      reason: string;
    }
  | {
      type: "subscription.charged";
      providerSubscriptionId: string;
      providerPaymentId: string;
      amountMinor: number;
      currency: string;
      periodStart: Date | null;
      periodEnd: Date | null;
      notes: Record<string, string>;
    }
  | {
      type: "subscription.cancelled";
      providerSubscriptionId: string;
    }
  | { type: "ignored"; reason: string };

export type RefundInput = {
  providerPaymentId: string;
  /** Omit for a full refund. Minor units, same currency as the payment. */
  amountMinor?: number;
  /** Free text kept on the provider's record, for reconciliation later. */
  reason: string;
  /**
   * Our transaction id, sent as the provider's idempotency key where it
   * supports one. Belt and braces over our own claim.
   */
  idempotencyKey: string;
};

export type RefundResult = {
  providerRefundId: string;
  amountMinor: number;
  /** Providers may settle asynchronously; "pending" is a success, not an error. */
  status: "processed" | "pending";
};

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;

  /** One-time purchase — a credit pack. */
  createOrder(input: CreateOrderInput): Promise<Checkout>;

  /** Recurring plan. `providerPlanId` comes from the Plan row. */
  createSubscription(
    input: CreateOrderInput & { providerPlanId: string },
  ): Promise<Checkout>;

  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  /**
   * Return money for a captured payment.
   *
   * `amountMinor` omitted means the full amount. Providers are expected to be
   * idempotent on their own side where they can be, but the caller does not
   * rely on it — the claim on `transaction.refundedAt` is what guarantees this
   * is attempted once.
   */
  refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Verify a webhook against the raw request body.
   *
   * Takes the raw string, never a parsed object: re-serialising JSON changes
   * the bytes and would invalidate every signature.
   */
  verifyWebhook(rawBody: string, signature: string): boolean;

  parseWebhook(rawBody: string): WebhookEvent;
}
