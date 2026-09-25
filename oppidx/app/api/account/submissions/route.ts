import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentSubscriber } from '@/lib/subscriberSession'

/**
 * GET /api/account/submissions — opportunities the logged-in subscriber
 * posted themselves via /submit (source: "user-provided", matched by
 * submitterEmail — see app/api/opportunities/submit/route.ts). Includes
 * rejected (soft-deleted) ones too, so a submitter can see *why* nothing
 * showed up rather than it just silently vanishing.
 */
export async function GET() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ items: [] })

  const rows = await prisma.opportunity.findMany({
    where: { submitterEmail: subscriber.email },
    orderBy: { addedAt: 'desc' },
    select: { id: true, title: true, verified: true, deletedAt: true, addedAt: true },
  })

  const items = rows.map(r => ({
    id: r.id,
    title: r.title,
    addedAt: r.addedAt,
    status: r.deletedAt ? 'rejected' : r.verified ? 'live' : 'pending',
  }))

  return NextResponse.json({ items })
}
