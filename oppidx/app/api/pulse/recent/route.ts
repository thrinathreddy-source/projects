import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseJsonArray } from '@/lib/safeJson'

/**
 * GET /api/pulse/recent — the Knowledge kind of the feed. PolicyDigest is
 * the durable, shareable snapshot of Pulse's live government-
 * source feed (see lib/policyDigest/generate.ts) — not a second, competing
 * Pulse system, the official daily/weekly record of the same one. Reading
 * it here needs nothing from Supabase, so this works the same locally and
 * in production. Daily digests only (not weekly roundups) — one card per
 * day reads naturally in a feed; a weekly summary would look like a
 * duplicate the same week it's generated.
 */
export async function GET() {
  const digests = await prisma.policyDigest.findMany({
    where: { periodType: 'daily' },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  return NextResponse.json({
    items: digests.map(d => {
      const items = parseJsonArray<{ title: string; category: string }>(d.items, `PolicyDigest.items ${d.period}`)
      return {
        period: d.period,
        summary: d.summary,
        itemCount: items.length,
        topCategory: items[0]?.category ?? null,
        createdAt: d.createdAt,
      }
    }),
  })
}
