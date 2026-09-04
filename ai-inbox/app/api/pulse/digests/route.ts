import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/pulse/digests — the archive: every daily and weekly policy
 * digest ever generated, newest first, so past ones aren't only reachable
 * if you already know the exact date/week slug. Powers the archive list
 * on /pulse.
 */
export async function GET() {
  const digests = await prisma.policyDigest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { period: true, periodType: true, summary: true, createdAt: true },
  })

  return NextResponse.json({
    items: digests.map(d => ({
      period: d.period,
      periodType: d.periodType,
      summary: d.summary,
      createdAt: d.createdAt,
    })),
  })
}
