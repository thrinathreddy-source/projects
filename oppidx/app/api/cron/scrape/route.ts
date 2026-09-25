import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { runScrapePass } from '@/lib/scraper/run'
import { afterScrapePass } from '@/lib/scraper/afterPass'
import { runCronPass } from '@/lib/cronGuard'

/**
 * GET /api/cron/scrape — triggers one scraper pass. Meant to be called by an
 * external scheduler (see .github/workflows/scrape-cron.yml), not a browser.
 *
 * Serverless hosts (Vercel included) freeze/recycle function instances
 * between requests, so the in-process setInterval scheduler in
 * lib/scraper/scheduler.ts can't reliably fire on its own hourly cadence in
 * production — it only really works on a persistent server process (local
 * dev, a VPS). This route is what actually keeps the board "updated hourly"
 * once deployed serverless.
 *
 * The post-pass work (expiring paid Featured slots, pushing to subscribers,
 * pinging Google's Indexing API) lives in lib/scraper/afterPass.ts so this
 * route and the in-process scheduler genuinely do the same thing — they used
 * to differ, and the scheduler path silently did none of it.
 *
 * Protected by a shared secret (not admin cookie auth) since the caller is a
 * scheduler, not a logged-in browser.
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

  return runCronPass('scrape', async () => {
    const result = await runScrapePass()
    await afterScrapePass(result, 'scrape cron')
    return result
  })
}
