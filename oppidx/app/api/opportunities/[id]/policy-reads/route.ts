import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchRecentPolicyItemsPool, matchPolicyReadsFromPool } from '@/lib/opportunityPulseMap'

/**
 * GET /api/opportunities/[id]/policy-reads — the same real, matched
 * headlines already shown inline on the opportunity detail page's
 * "Policy reads" section, exposed as a tiny read-only endpoint so a card
 * in the feed can preview them in a popup instead of navigating away.
 * No new matching logic — this just calls what feedEnrichment.ts and the
 * detail page already call.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const opp = await prisma.opportunity.findUnique({ where: { id }, select: { tags: true, audience: true, country: true, deletedAt: true } })
  if (!opp || opp.deletedAt) return NextResponse.json({ items: [] }, { status: 404 })

  const pool = await fetchRecentPolicyItemsPool()
  const items = matchPolicyReadsFromPool(opp, pool)
  return NextResponse.json({ items })
}
