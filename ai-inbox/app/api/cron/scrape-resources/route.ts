import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { runResourceScrapePass }     from '@/lib/resources/scraper/run'
import { runCronPass }               from '@/lib/cronGuard'

// The GitHub topic-search source paces its ~8 requests to stay under
// GitHub's unauthenticated search rate limit, which alone takes ~50s —
// the platform default function timeout isn't enough headroom.
export const maxDuration = 60

/**
 * GET /api/cron/scrape-resources — triggers one resource scraper pass.
 * Meant to be called by an external scheduler (see
 * .github/workflows/scrape-resources-cron.yml), not a browser — mirrors
 * app/api/cron/scrape/route.ts's pattern for the opportunity scraper.
 *
 * Runs less often than the hourly opportunity cron (every 6 hours) — new
 * resources don't go stale the way job/scholarship deadlines do, and this
 * is gentler on GitHub's and Reddit's unauthenticated rate limits.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not set up yet.' }, { status: 503 })
  }

  const auth = req.headers.get('authorization')
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runCronPass('scrape-resources', () => runResourceScrapePass())
}
