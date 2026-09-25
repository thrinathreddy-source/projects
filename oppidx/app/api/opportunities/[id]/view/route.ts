import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { getCurrentSubscriber }      from '@/lib/subscriberSession'

/**
 * POST /api/opportunities/[id]/view — public. Increments the real view
 * counter shown on the homepage. Rate-limited per IP+opportunity so the
 * "Opportunities Viewed" count can't be trivially spammed — beyond the
 * limit we just no-op and return ok, since a blocked increment shouldn't
 * surface as an error to a real visitor.
 *
 * Also the one real signal for "did saving something here lead anywhere":
 * if the clicking visitor has a subscriber session and had already saved
 * this opportunity, this marks SavedOpportunity.appliedAt — a no-op
 * updateMany for everyone else (anonymous visitors, or a save that isn't
 * this opportunity), so it never affects the view-count path either way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rl = rateLimit(`view:${getClientIp(req)}:${id}`, 10 * 60_000, 5)

  if (rl.ok) {
    await prisma.opportunity.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }).catch(() => null)
  }

  const subscriber = await getCurrentSubscriber()
  if (subscriber) {
    await prisma.savedOpportunity.updateMany({
      where: { subscriberId: subscriber.id, opportunityId: id, appliedAt: null },
      data: { appliedAt: new Date() },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
