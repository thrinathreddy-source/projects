import Razorpay from 'razorpay'
import { getSubmissionFeeInr } from './submissionFees'

export { SUBMISSION_FEES_INR, FEATURED_ADDON_INR, FEATURED_DURATION_DAYS, getSubmissionFeeInr } from './submissionFees'

/**
 * Number of billing cycles requested per subscription. Razorpay has no
 * literal "until cancelled" option, so we request a long run and rely on
 * the customer (or admin) to cancel via the provider if they ever want to
 * stop — same pattern most Razorpay subscription integrations use.
 *
 * Must be cycle-aware: a flat count applied to both plans (previously a
 * single `SUBSCRIPTION_CYCLES = 100`) means 100 *years* for the annual
 * plan, not 100 months — Razorpay/NPCI reject a UPI Autopay mandate whose
 * computed end_time lands past ~2121, which 100 annual cycles from now
 * does. 15 years of runway is effectively "forever" for a subscription
 * that auto-renews and can be re-created if ever actually exhausted, and
 * stays safely inside that bound for both cycles.
 */
const SUBSCRIPTION_YEARS = Number(process.env.RAZORPAY_SUBSCRIPTION_YEARS ?? 15)

export function getSubscriptionCycles(cycle: 'monthly' | 'annual'): number {
  return cycle === 'monthly' ? SUBSCRIPTION_YEARS * 12 : SUBSCRIPTION_YEARS
}

/** null when billing isn't configured yet — callers must check for this
 * and fail closed (503), never silently skip payment. */
export const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null

export function getSubmissionFeePaise(listingType: string, wantsFeatured: boolean): number {
  return getSubmissionFeeInr(listingType, wantsFeatured) * 100
}
