/**
 * Review fee to submit an opportunity — this is a premium, hand-curated
 * board, not a free-for-all bulletin. Paying gets a listing a human review;
 * it never buys approval.
 *
 * Tiered by listing type: a company posting a paid job/internship is
 * charged more than a free scholarship, grant, or competition listing,
 * since the former is commercial hiring activity and the latter is the
 * kind of listing this board exists to surface for students. An optional
 * "Featured" upsell adds guaranteed inclusion in the homepage's daily
 * featured-picks pool for a fixed window after approval (see
 * FEATURED_DURATION_DAYS below and the scrape cron's expiry sweep).
 *
 * Kept in its own file, separate from lib/billing/razorpay.ts, because that
 * file imports the (server-only) `razorpay` SDK — this one has no such
 * dependency, so the /submit page can import it directly for a live price
 * display without pulling a Node-only SDK into the client bundle.
 */
export const SUBMISSION_FEES_INR: Record<'job_internship' | 'scholarship_grant' | 'competition', number> = {
  job_internship: 3000,
  scholarship_grant: 1000,
  competition: 1000,
}
export const FEATURED_ADDON_INR = 750
export const FEATURED_DURATION_DAYS = 7

export function getSubmissionFeeInr(listingType: string, wantsFeatured: boolean): number {
  const base = SUBMISSION_FEES_INR[listingType as keyof typeof SUBMISSION_FEES_INR] ?? SUBMISSION_FEES_INR.scholarship_grant
  return base + (wantsFeatured ? FEATURED_ADDON_INR : 0)
}

export function getSubmissionFeePaise(listingType: string, wantsFeatured: boolean): number {
  return getSubmissionFeeInr(listingType, wantsFeatured) * 100
}
