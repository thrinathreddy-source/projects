import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { sendOutcomeNudges } from '@/lib/push'
import { runCronPass } from '@/lib/cronGuard'

/**
 * GET /api/cron/outcome-nudge — asks people what happened to things they
 * applied to weeks ago.
 *
 * Weekly, not daily: this is the one notification that asks the reader for
 * something rather than offering them something, and lib/push.ts already
 * caps it at one person per throttle window. A daily cadence would turn the
 * single mechanism that produces the site's only real proof into the reason
 * people revoke notification permission.
 *
 * Same shared-secret protection as the scrape cron — the caller is a
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

  return runCronPass('outcome-nudge', () => sendOutcomeNudges())
}
