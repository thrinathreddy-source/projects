/** Not wired to any gate yet — this is the single hook a future paywall
 * (newsletter send job, or a site-wide gate) should call, so "paid" has one
 * definition everywhere instead of getting re-derived ad hoc per call site. */
export function isPaidSubscriber(sub: { plan: string; subscriptionStatus: string | null }): boolean {
  return sub.plan === 'paid' && sub.subscriptionStatus === 'active'
}
