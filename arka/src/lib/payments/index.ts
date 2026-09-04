import { RazorpayProvider } from "@/lib/payments/razorpay";
import type { PaymentProvider } from "@/lib/payments/types";

export type {
  Checkout,
  CheckoutIntent,
  CreateOrderInput,
  Currency,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from "@/lib/payments/types";

/**
 * The active payment provider.
 *
 * One at a time, by design: running two payment providers concurrently means
 * two reconciliation processes and two sets of webhook edge cases, which is not
 * a problem worth having before the first hundred customers.
 */
const razorpay = new RazorpayProvider();

export function payments(): PaymentProvider {
  return razorpay;
}

export function paymentsConfigured(): boolean {
  return razorpay.isConfigured();
}
