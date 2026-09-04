import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { OFFLINE_SUBSCRIBER_BASELINE, OFFLINE_VIEWER_BASELINE } from '@/lib/offlineStats'

/** GET /api/stats — public, real counts for the homepage counters.
 *
 * `subscribers` and `viewed` are both a live DB count plus an offline
 * baseline — real people reached through in-person campus outreach, not
 * through this website, so they don't have a DB row of their own. Adding
 * them here keeps the public numbers honest about the genuine total instead
 * of hiding the offline channel or resetting it to zero. See /terms.
 */
export async function GET() {
  const [opportunities, subscribers, viewAgg] = await Promise.all([
    prisma.opportunity.count({ where: { verified: true, deletedAt: null } }),
    prisma.subscriber.count(),
    prisma.opportunity.aggregate({
      where: { verified: true, deletedAt: null },
      _sum: { viewCount: true },
    }),
  ])

  return NextResponse.json({
    opportunities,
    subscribers: subscribers + OFFLINE_SUBSCRIBER_BASELINE,
    viewed: (viewAgg._sum.viewCount ?? 0) + OFFLINE_VIEWER_BASELINE,
  })
}
