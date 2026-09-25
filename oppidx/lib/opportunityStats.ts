import { prisma } from '@/lib/db'

/**
 * A stat only ever reaches a card if it clears a meaningful floor — the
 * same "leave it blank rather than fake it" rule already applied to
 * relatedness in lib/opportunityResourceMap.ts, applied here to numbers.
 * A niche, legitimate listing with 3 saves isn't broken; it just doesn't
 * get a stats line. Nobody sees "0 others chasing this."
 */
export const STAT_THRESHOLDS = {
  views: 20,
  saves: 5,
  applied: 3,
  chasing: 2, // a match needs a pair
  newDays: 7,
} as const

export interface OpportunityStatCounts {
  saves: number
  applied: number
}

/** Batched — one groupBy for saves, one for applied, never a query per
 * card. Callers pass every id on the current page/response at once. */
export async function getOpportunityStats(ids: string[]): Promise<Record<string, OpportunityStatCounts>> {
  const result: Record<string, OpportunityStatCounts> = {}
  for (const id of ids) result[id] = { saves: 0, applied: 0 }
  if (ids.length === 0) return result

  const [saveRows, appliedRows] = await Promise.all([
    prisma.savedOpportunity.groupBy({
      by: ['opportunityId'],
      where: { opportunityId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.savedOpportunity.groupBy({
      by: ['opportunityId'],
      where: { opportunityId: { in: ids }, appliedAt: { not: null } },
      _count: { _all: true },
    }),
  ])

  for (const r of saveRows) result[r.opportunityId].saves = r._count._all
  for (const r of appliedRows) result[r.opportunityId].applied = r._count._all

  return result
}

export type HeroStatKind = 'applied' | 'views' | 'saves' | 'new'

/** The one stat worth a visual highlight on a card, if any — never more
 * than one, so the card gets a single clear signal instead of a row of
 * competing badges. Ranked by how much it actually says about real
 * momentum, not just whichever number is biggest. */
export function pickHeroStat(
  views: number,
  stats: OpportunityStatCounts,
  addedAt: Date
): { kind: HeroStatKind; label: string } | null {
  const isNew = Date.now() - addedAt.getTime() < STAT_THRESHOLDS.newDays * 86_400_000
  const candidates: Array<{ kind: HeroStatKind; label: string; weight: number }> = []

  if (stats.applied >= STAT_THRESHOLDS.applied) {
    candidates.push({ kind: 'applied', label: `✓ ${stats.applied} applied`, weight: stats.applied * 3 })
  }
  if (views >= STAT_THRESHOLDS.views) {
    candidates.push({ kind: 'views', label: `👁 ${views.toLocaleString()} views`, weight: views })
  }
  if (stats.saves >= STAT_THRESHOLDS.saves) {
    candidates.push({ kind: 'saves', label: `☆ Saved by ${stats.saves}`, weight: stats.saves * 2 })
  }
  if (isNew) {
    candidates.push({ kind: 'new', label: '🆕 New', weight: 1 })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.weight - a.weight)
  return candidates[0]
}
