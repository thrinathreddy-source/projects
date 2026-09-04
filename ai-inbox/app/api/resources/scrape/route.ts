import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { requireAuth }  from '@/lib/auth'
import { rateLimit }    from '@/lib/rateLimit'
import { getClientIp }  from '@/lib/ip'
import { runResourceScrapePass } from '@/lib/resources/scraper/run'
import type { NextRequest } from 'next/server'

// See app/api/cron/scrape-resources/route.ts — the GitHub topic-search
// source needs headroom beyond the platform default timeout.
export const maxDuration = 60

/** GET /api/resources/scrape — admin-only: recent resource scraper run history. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runs = await prisma.resourceScrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 })
  return NextResponse.json({ runs })
}

/** POST /api/resources/scrape — admin-only: trigger a resource scrape pass immediately. */
export async function POST(req: NextRequest) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`resource-scrape-run:${getClientIp(req)}`, 60_000, 3)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const result = await runResourceScrapePass()
  return NextResponse.json(result)
}
