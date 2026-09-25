import { prisma } from '@/lib/db'
import { notifyMatchingSubscribers } from '@/lib/push'
import { notifyGoogleJobPostingUpdates } from '@/lib/seo/googleIndexing'
import type { RunResult } from './run'

/**
 * Everything that must happen after a scrape pass, wherever the pass was
 * triggered from.
 *
 * This exists because the two triggers had silently diverged. The cron route
 * (app/api/cron/scrape/route.ts) expired stale paid "Featured" slots, pushed
 * to matching subscribers, and pinged Google's Indexing API. The in-process
 * scheduler (lib/scraper/scheduler.ts) called `runScrapePass()` and threw the
 * result away — so on any persistent server, which is exactly the deployment
 * instrumentation.ts enables the scheduler for, the board scraped every hour
 * and never once notified anybody or told Google a new JobPosting existed.
 * Nothing errored; the work simply didn't happen on that path.
 *
 * One function, both callers. Never throws — a failed notification must not
 * turn a successful scrape into a failed one.
 */
export async function afterScrapePass(result: RunResult, label: string) {
  // Paid "Featured" upsells are only good for a fixed window (see
  // lib/billing/razorpay.ts's FEATURED_DURATION_DAYS) — unset featured once
  // it passes so the homepage's featured pool doesn't keep a stale paid
  // listing forever. Piggybacks on the hourly cadence rather than adding a
  // schedule of its own.
  await prisma.opportunity.updateMany({
    where: { featured: true, featuredUntil: { lt: new Date() } },
    data: { featured: false },
  }).catch(err => console.error(`[${label}] featured expiry failed:`, err))

  if (result.added <= 0) return

  const newOpportunities = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, addedAt: { gte: result.startedAt } },
    // region/difficulty/compType are needed by CollectionDef.match (see
    // lib/push.ts) — without them every location- and compensation-scoped
    // collection would quietly match nothing rather than fail loudly.
    select: {
      id: true, audience: true, title: true, tags: true, org: true, location: true,
      country: true, region: true, difficulty: true, compType: true,
    },
  })

  await notifyMatchingSubscribers(newOpportunities).catch(err =>
    console.error(`[${label}] push notification pass failed:`, err)
  )

  const indexing = await notifyGoogleJobPostingUpdates(newOpportunities).catch(err => {
    console.error(`[${label}] Google Indexing API notification failed:`, err)
    return null
  })
  if (indexing) console.log(`[${label}] Google indexing:`, indexing)
}
