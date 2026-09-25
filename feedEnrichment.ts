import { prisma } from '@/lib/db'
import { getOpportunityStats, pickHeroStat, STAT_THRESHOLDS } from '@/lib/opportunityStats'
import { getCommentCounts } from '@/lib/comments'
import { relatedResourceCategories } from '@/lib/opportunityResourceMap'
import { fetchUpcomingGatheringsPool, matchGatheringsFromPool } from '@/lib/opportunityGatheringMap'
import { chasingCohortSizes } from '@/lib/chasingCohort'
import { fetchRecentPolicyItemsPool, matchPolicyReadsFromPool } from '@/lib/opportunityPulseMap'

export interface CardExtras {
  heroStat: { kind: string; label: string } | null
  discussionCount: number
  resourceCount: number
  gatheringCount: number
  chasingCount: number
  policyReadCount: number
}

/**
 * The attachment strip's data, for a whole page of opportunities at once —
 * every piece here is batched (one query per kind of extra, never one per
 * card) and every piece follows the same rule: below its threshold, it's
 * absent from the result entirely, not a zero. The card component decides
 * what to render; this only ever hands it real, meaningful numbers.
 */
export async function enrichOpportunities(
  opps: Array<{ id: string; tags: string; audience: string; country: string; viewCount: number; addedAt: Date }>
): Promise<Record<string, CardExtras>> {
  const ids = opps.map(o => o.id)
  if (ids.length === 0) return {}

  const [stats, discussionCounts, chasingCounts, resourceCategoryCounts, gatheringPool, policyPool] = await Promise.all([
    getOpportunityStats(ids),
    getCommentCounts('opportunity', ids),
    chasingCohortSizes(ids),
    prisma.resource.groupBy({
      by: ['category'],
      where: { verified: true, deletedAt: null },
      _count: { _all: true },
    }),
    fetchUpcomingGatheringsPool(),
    fetchRecentPolicyItemsPool(),
  ])

  const categoryCountMap = new Map(resourceCategoryCounts.map(r => [r.category, r._count._all]))

  const result: Record<string, CardExtras> = {}
  for (const opp of opps) {
    const oppStats = stats[opp.id] ?? { saves: 0, applied: 0 }
    const heroStat = pickHeroStat(opp.viewCount, oppStats, opp.addedAt)

    const resourceCount = relatedResourceCategories(opp)
      .reduce((sum, cat) => sum + (categoryCountMap.get(cat) ?? 0), 0)

    const gatheringCount = matchGatheringsFromPool(opp, gatheringPool).length
    const policyReadCount = matchPolicyReadsFromPool(opp, policyPool).length

    const discussionCount = discussionCounts[opp.id] ?? 0
    const chasingCount = chasingCounts[opp.id] ?? 0

    result[opp.id] = {
      heroStat,
      discussionCount: discussionCount > 0 ? discussionCount : 0,
      resourceCount: resourceCount > 0 ? resourceCount : 0,
      gatheringCount,
      chasingCount: chasingCount >= STAT_THRESHOLDS.chasing ? chasingCount : 0,
      policyReadCount,
    }
  }
  return result
}
