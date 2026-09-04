import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { runScrapePass } from '@/lib/scraper/run'
import type { NextRequest } from 'next/server'

/** GET /api/scrape — admin-only: recent native scraper run history. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runs = await prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 })
  return NextResponse.json({ runs })
}

/** POST /api/scrape — admin-only: trigger a scrape pass immediately, on top of the hourly one. */
export async function POST(req: NextRequest) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`scrape-run:${getClientIp(req)}`, 60_000, 3)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const result = await runScrapePass()
  return NextResponse.json(result)
}
