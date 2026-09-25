import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PULSE_OPPORTUNITY_KEYWORDS } from '@/lib/platform/pulseOpportunityMap'

/**
 * GET /api/pulse/live/related-opportunities?category=<Pulse category>
 * — the Policy → Opportunities graph edge: real, verified listings whose
 * tags/title/description match that category's keyword list (see
 * lib/platform/pulseOpportunityMap.ts). No fabricated relevance — a
 * category with nothing genuinely matching returns an empty list, not a
 * stretched one.
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') ?? ''
  const keywords = PULSE_OPPORTUNITY_KEYWORDS[category]
  if (!keywords) return NextResponse.json({ items: [] })

  const items = await prisma.opportunity.findMany({
    where: {
      verified: true,
      deletedAt: null,
      OR: keywords.flatMap(k => [
        { tags: { contains: k } },
        { title: { contains: k } },
        { description: { contains: k } },
      ]),
    },
    select: { id: true, title: true, org: true, audience: true },
    orderBy: [{ viewCount: 'desc' }, { addedAt: 'desc' }],
    take: 3,
  })

  return NextResponse.json({ items })
}
