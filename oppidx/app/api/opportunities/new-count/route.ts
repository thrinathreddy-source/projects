import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/opportunities/new-count?since=<ISO timestamp> — count of
 * verified opportunities added after that timestamp. Powers the "X new
 * since your last visit" homepage banner. No auth needed — this is the
 * same real, public count already shown elsewhere (e.g. the homepage
 * opportunity total), just filtered by date.
 */
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since')
  const sinceDate = since ? new Date(since) : null
  if (!sinceDate || Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: 'A valid ISO "since" timestamp is required.' }, { status: 400 })
  }

  const count = await prisma.opportunity.count({
    where: { verified: true, deletedAt: null, addedAt: { gt: sinceDate } },
  })

  return NextResponse.json({ count })
}
