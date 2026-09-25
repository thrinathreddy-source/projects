import { prisma } from '@/lib/db'

/**
 * What happened to a chase.
 *
 * The four values are deliberately exhaustive and deliberately include the
 * two unglamorous ones. A tracker that only lets you record wins is a
 * trophy cabinet, not a tracker — nobody returns to it, and the aggregate
 * it produces is a lie. "no_response" in particular is the single most
 * common real outcome of applying to anything, and refusing to name it is
 * how a board ends up claiming a 90% success rate.
 */
export const OUTCOMES = ['got_it', 'rejected', 'no_response', 'withdrew'] as const
export type Outcome = (typeof OUTCOMES)[number]

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  got_it:      'Got it',
  rejected:    'Turned down',
  no_response: 'Never heard back',
  withdrew:    'Withdrew',
}

/** Past-tense phrasing for the public proof surface, where the subject is
 * a Chaser rather than the reader's own row. */
export const OUTCOME_PUBLIC_LABEL: Record<Outcome, string> = {
  got_it:      'got it',
  rejected:    'was turned down',
  no_response: 'never heard back',
  withdrew:    'withdrew',
}

export const OUTCOME_COLOR: Record<Outcome, string> = {
  got_it:      'var(--green)',
  rejected:    'var(--ink-3)',
  no_response: 'var(--ink-3)',
  withdrew:    'var(--ink-3)',
}

/** Free-text note cap. Long enough for a real sentence about what happened,
 * short enough that it can never become an essay nobody reads or a place to
 * paste a phone number (which the standards in /manifesto forbid anyway). */
export const OUTCOME_NOTE_MAX = 280

/**
 * The board's real, aggregate track record.
 *
 * Every number here is a genuine count of rows people entered themselves —
 * the same rule the rest of the site follows. Notably it reports `reported`
 * (how many outcomes exist at all) alongside the wins, because a "127 got
 * it" with no denominator is exactly the inflated, unfalsifiable number
 * /manifesto promises not to show.
 *
 * Returns null when there isn't enough recorded to say anything honest yet,
 * so every caller renders nothing rather than a row of zeroes — same
 * threshold pattern as lib/feedEnrichment.ts.
 */
const PROOF_MIN_REPORTED = 5

export interface OutcomeStats {
  reported: number
  gotIt: number
  stillOpen: number
}

export async function outcomeStats(): Promise<OutcomeStats | null> {
  const [reported, gotIt, stillOpen] = await Promise.all([
    prisma.savedOpportunity.count({ where: { outcome: { not: null } } }),
    prisma.savedOpportunity.count({ where: { outcome: 'got_it' } }),
    prisma.savedOpportunity.count({ where: { outcome: null, appliedAt: { not: null } } }),
  ])
  if (reported < PROOF_MIN_REPORTED) return null
  return { reported, gotIt, stillOpen }
}

export interface PublicOutcome {
  outcome: Outcome
  note: string | null
  opportunityTitle: string
  opportunityOrg: string | null
  opportunitySlug: string | null
  opportunityId: string
  at: string
}

/**
 * Consented outcomes, for the public proof surface.
 *
 * Two independent gates, both required: the person set an outcome, and the
 * person separately ticked shareConsent. No name, no email, no profile link
 * is returned — the proof is that a real chase reached a real end, not who
 * it was. That's the same line lib/chasingCohort.ts already holds when it
 * refuses to expose a browsable list of who's applying to what.
 */
export async function publicOutcomes(limit = 12): Promise<PublicOutcome[]> {
  const rows = await prisma.savedOpportunity.findMany({
    where: { shareConsent: true, outcome: { not: null } },
    orderBy: { outcomeAt: 'desc' },
    take: limit,
  })
  if (rows.length === 0) return []

  const opps = await prisma.opportunity.findMany({
    where: { id: { in: rows.map(r => r.opportunityId) } },
    select: { id: true, title: true, org: true, slug: true },
  })
  const byId = new Map(opps.map(o => [o.id, o]))

  return rows.flatMap(r => {
    const opp = byId.get(r.opportunityId)
    // A consented outcome on a listing that has since been removed has
    // nothing to point at — drop it rather than render a dangling claim.
    if (!opp || !isOutcome(r.outcome)) return []
    return [{
      outcome: r.outcome,
      note: r.outcomeNote,
      opportunityTitle: opp.title,
      opportunityOrg: opp.org,
      opportunitySlug: opp.slug,
      opportunityId: opp.id,
      at: (r.outcomeAt ?? r.savedAt).toISOString(),
    }]
  })
}
