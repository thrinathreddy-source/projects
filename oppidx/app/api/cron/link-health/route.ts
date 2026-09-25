import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { prisma } from '@/lib/db'
import { sendOpsReport } from '@/lib/alerts'
import { checkLink, DEAD_STRIKES_TO_RETIRE } from '@/lib/linkHealth'
import { extractDeadline } from '@/lib/scraper/deadline'
import { stripHtml } from '@/lib/scraper/util'
import { notifyGoogleJobPostingRemovals } from '@/lib/seo/googleIndexing'
import { isNonJobListing } from '@/lib/seo/jobPosting'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import { runCronPass } from '@/lib/cronGuard'

/**
 * Rolling link-health pass: re-checks the least-recently-verified listings and
 * retires the ones whose application page is genuinely gone.
 *
 * Why this exists. Every listing was checked once, at ingestion, and never
 * again — so a posting stayed on the board indefinitely after the employer
 * took it down. A sample of live listings turned up several 404s and a 410.
 * That is a direct contradiction of the board's own promise ("verified before
 * they go up", "no dead links"), and for the listings carrying JobPosting
 * markup it is also what Google's job-posting policy explicitly asks sites to
 * avoid: expired postings must be removed promptly.
 *
 * Retirement is a soft delete, so the row (and its view count, comments and
 * outcome history) survives and the decision is reversible. Everything
 * downstream already filters on `deletedAt`, so a retired listing leaves the
 * board, the collections, the RSS feed and the sitemap in one move. Google is
 * then told directly via URL_DELETED rather than left to rediscover the 404.
 *
 * Deliberately batched and rate-limited rather than checking everything: ~2,700
 * outbound requests in one invocation would blow the function timeout and look
 * like an attack to the hosts being checked. At BATCH_SIZE daily the whole
 * board cycles through in about a fortnight, which is a reasonable staleness
 * window for job postings.
 */

const BATCH_SIZE = 200
/** Small, so a burst of checks doesn't hammer one ATS host. */
const CONCURRENCY = 8

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Cron is not set up yet.' }, { status: 503 })
  if (!secureCompare(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return runCronPass('link-health', async () => {
  // Least-recently-checked first, nulls first — so listings that have never
  // been re-checked since ingestion are the front of the queue.
  const due = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null },
    select: {
      id: true, url: true, slug: true, title: true, tags: true, org: true, location: true,
      country: true, deadStrikes: true, validThrough: true,
    },
    orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { addedAt: 'asc' }],
    take: BATCH_SIZE,
  })

  const now = new Date()
  const retired: typeof due = []
  let alive = 0
  let inconclusive = 0
  let deadlinesFound = 0
  const deadStatuses: Record<string, number> = {}

  await mapWithConcurrency(due, CONCURRENCY, async listing => {
    // Pull the page text only where a deadline is both missing and plausibly
    // findable. Two narrowings, each from measurement rather than guesswork:
    //
    // No deadline yet — nothing to learn otherwise.
    //
    // And only for scholarships, fellowships, grants and competitions. Those
    // are the listing types that publish a closing date; ordinary job postings
    // almost never do, and their ATS pages don't carry one. Without this the
    // pass would upgrade every liveness check from a cheap HEAD to a full GET
    // (~150 KB each) across the whole board every fortnight, for a yield
    // measured at effectively zero — Chevening's deadline isn't in its
    // server-rendered HTML at all, and Ayn Rand's page says "Next Deadline
    // TBD". Restricting it keeps the capability without paying for it
    // everywhere.
    // isNonJobListing rather than a raw tag scan: the two are the same
    // distinction seen from opposite sides (see lib/seo/jobPosting.ts), and
    // sharing the predicate is what stops them drifting. They had drifted —
    // this read `tags` alone, which on this board are topical ("machine
    // learning/ai", "design", "web") and never carry the words being looked
    // for, so the deadline lookup almost never ran on the very listings whose
    // pages state a closing date in prose.
    const wantBody = !listing.validThrough && isNonJobListing(listing)
    const { verdict, status, body } = await checkLink(listing.url, wantBody)

    if (verdict === 'dead') {
      const strikes = listing.deadStrikes + 1
      deadStatuses[String(status)] = (deadStatuses[String(status)] ?? 0) + 1

      if (strikes >= DEAD_STRIKES_TO_RETIRE) {
        await prisma.opportunity.update({
          where: { id: listing.id },
          data: { deletedAt: now, lastCheckedAt: now, deadStrikes: strikes },
        })
        retired.push(listing)
      } else {
        await prisma.opportunity.update({
          where: { id: listing.id },
          data: { lastCheckedAt: now, deadStrikes: strikes },
        })
      }
      return
    }

    // Alive or inconclusive both clear the strike count — see lib/linkHealth.ts
    // for why an inconclusive result must never accumulate toward a deletion.
    if (verdict === 'alive') alive++
    else inconclusive++

    // Same extractor, same refusals (no bare dates, no ambiguous DD/MM, never
    // a date already past) — just pointed at the real posting instead of our
    // own stored copy. Tags are stripped first so a date inside markup or a
    // script block can't be read as prose.
    let discovered: Date | null = null
    if (wantBody && body) {
      discovered = extractDeadline(stripHtml(body), now)
      if (discovered) deadlinesFound++
    }

    await prisma.opportunity.update({
      where: { id: listing.id },
      data: {
        lastCheckedAt: now,
        deadStrikes: 0,
        ...(discovered ? { validThrough: discovered, deadlineSource: 'application-page' } : {}),
      },
    })
  })

  // Only the retired ones, and only those that actually carried JobPosting
  // markup — the eligibility gate inside this call is the same one the page
  // uses to decide whether to emit it.
  const indexing = retired.length
    ? await notifyGoogleJobPostingRemovals(retired).catch(err => {
        console.error('[link-health] Google removal notification failed:', err)
        return null
      })
    : null

  const summary = {
    checked: due.length,
    alive,
    inconclusive,
    retired: retired.length,
    deadlinesFound,
    deadStatuses,
    indexing,
  }

  // Only mail on a retirement — a quiet pass shouldn't generate noise, but a
  // sudden spike (a whole source going dark, or this cron misfiring) should be
  // visible without going to look for it.
  if (retired.length > 0) {
    await sendOpsReport(
      `link health: ${retired.length} listing(s) retired`,
      [
        `Checked ${due.length} listings.`,
        `Alive: ${alive}   Inconclusive: ${inconclusive}   Retired: ${retired.length}`,
        `Terminal statuses seen: ${JSON.stringify(deadStatuses)}`,
        '',
        'Retired (soft-deleted, reversible by clearing deletedAt):',
        ...retired.map(r => `- ${r.org ?? 'unknown'} — ${r.slug ?? r.id}\n  ${r.url}`),
      ].join('\n'),
    ).catch(err => console.error('[link-health] report email failed:', err))
  }

  console.log('[link-health]', JSON.stringify(summary))
  return summary
  })
}
