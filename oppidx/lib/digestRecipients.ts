/** One row of today's DigestEmailLog, as far as recipient selection cares. */
export interface DigestLogRow {
  subscriberId: string
  /** "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed" */
  status: string
}

/**
 * Which of today's eligible subscribers still need the weekly digest.
 *
 * The weekly send is idempotent per calendar date so a same-day retry can't
 * double-email anyone. That dedup used to skip every subscriber with *any*
 * log row for today — including the ones whose send had just failed. A
 * transient Resend error therefore wrote status:'failed' and then permanently
 * excluded that subscriber from every retry that day: they silently lost the
 * week's digest, and the retry that exists to fix exactly this could never
 * reach them.
 *
 * So 'failed' is the one status that does not block a resend. Everything else
 * is a hard skip — 'bounced' and 'complained' above all, because re-sending to
 * someone who complained is the worst outcome available here. (The caller also
 * filters suppressed addresses out of `eligible` before this runs; this is the
 * second guard, not the only one.)
 */
export function digestRecipients<T extends { id: string }>(
  eligible: T[],
  todaysLog: DigestLogRow[],
): T[] {
  const settled = new Set(
    todaysLog.filter(row => row.status !== 'failed').map(row => row.subscriberId),
  )
  return eligible.filter(s => !settled.has(s.id))
}
