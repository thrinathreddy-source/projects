/**
 * Razorpay's SDK rejects with a plain object rather than an Error — roughly
 * `{ statusCode, error: { description } }` — so neither `instanceof Error` nor
 * `err.message` gets anything useful out of it. Narrowed in one place instead
 * of re-asserting the shape at each catch site, same approach as
 * lib/isUniqueConstraintError.ts.
 *
 * `statusCode` 400 is the one callers care about: it's what Razorpay returns
 * when a subscription is already cancelled or expired, which every cancel path
 * here treats as success rather than as a failure.
 */
export function razorpayError(e: unknown): { statusCode?: number; description?: string } {
  const err = e as { statusCode?: number; error?: { description?: string } } | null
  return { statusCode: err?.statusCode, description: err?.error?.description }
}
