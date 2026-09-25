import { prisma } from '@/lib/db'

const PICK_COUNT = 3

function daySeed(): number {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000))
}

/** Midnight UTC of the current day — the same boundary daySeed() rolls on. */
function startOfUtcDay(): Date {
  return new Date(daySeed() * 24 * 60 * 60 * 1000)
}

/**
 * Candidates for a day's picks: verified, live, and *already on the board when
 * the day began*.
 *
 * The `addedAt` bound is what makes "the same pick all day" actually true.
 * Both selectors below choose by numeric offset into this set, so the answer
 * is only stable while the set is. The scraper adds listings every hour
 * (.github/workflows/scrape-cron.yml and lib/scraper/scheduler.ts), and with
 * an unbounded set each new row shifted the offset: at today's seed, going
 * from 3,001 to 3,002 rows moves `daySeed() % total` by six positions. So the
 * widget that documents itself as fixed until midnight UTC was in practice
 * re-rolling every hour — precisely the "changes on every request" behaviour
 * its own comment says would look broken on a third party's site.
 *
 * Freezing the lower bound at midnight leaves only retirement as a source of
 * drift, which is once-daily (the link-health cron) and rare, against dozens
 * of additions a day.
 */
const dayCandidates = () => ({
  verified: true,
  deletedAt: null,
  addedAt: { lt: startOfUtcDay() },
})

const allCandidates = () => ({ verified: true, deletedAt: null })

/**
 * The candidate filter to actually use today, with its row count.
 *
 * Falls back to the unbounded set when nothing predates midnight — a board
 * whose listings all arrived today (a fresh deploy, a reseed, a backfill that
 * rewrote addedAt). Stability is the goal, but showing nothing at all is worse
 * than showing something that may move, so the bound yields rather than
 * emptying the widget.
 */
async function candidatesForToday() {
  const bounded = dayCandidates()
  const total = await prisma.opportunity.count({ where: bounded })
  if (total > 0) return { where: bounded, total }

  const all = allCandidates()
  return { where: all, total: await prisma.opportunity.count({ where: all }) }
}

// Deterministic PRNG (mulberry32) seeded from the calendar day — a plain
// Math.random() here meant a retried/re-triggered cron run on the same day
// (see app/api/cron/social-digest/route.ts) picked a *different* random set
// and posted it to Telegram/Discord again, while snapshotDailyDigest's
// once-per-date uniqueness meant the "see it online" link in that second
// message still pointed at the *first* run's (now mismatched) picks.
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A small, deterministic-per-day pick of verified opportunities — shared by
 * every distribution channel (Telegram, Discord, ...) so they all show the
 * same picks instead of each rolling their own, and a same-day retry of the
 * cron reproduces the identical set rather than a different random one.
 * Deliberately not a dump of everything new: the board adds dozens of
 * listings a day, and a firehose digest would read as spam and cut against
 * the "elite, hand-curated" brand the rest of the site is built on.
 *
 * Samples via offsets rather than pulling the whole table into memory to
 * shuffle it — cheap even as the board grows.
 */
export async function getDailyPicks() {
  const { where, total } = await candidatesForToday()
  if (total === 0) return []

  const rand = seededRandom(daySeed())
  const pickCount = Math.min(PICK_COUNT, total)
  const offsets = new Set<number>()
  while (offsets.size < pickCount) {
    offsets.add(Math.floor(rand() * total))
  }

  const picks = await Promise.all(
    [...offsets].map(skip =>
      prisma.opportunity.findFirst({
        where,
        orderBy: { id: 'asc' },
        skip,
      })
    )
  )
  return picks.filter((o): o is NonNullable<typeof o> => !!o)
}

/**
 * A single deterministic pick for the day — same opportunity for every
 * visitor and every request until midnight UTC, then it rolls over. Used by
 * the embeddable "Opportunity of the Day" widget, where a picks-change-on-
 * every-request feel would look broken to a third-party site embedding it.
 */
export async function getOpportunityOfTheDay() {
  // Returns null rather than throwing when the database is unreachable. The
  // embed page already renders a graceful "nothing today" state for null, and
  // this route is statically prerendered — so without this an unreachable
  // database (a Vercel preview, which has no Production env vars) aborted the
  // whole build. Same rule as lib/opportunityPool.ts.
  try {
    const { where, total } = await candidatesForToday()
    if (total === 0) return null

    return await prisma.opportunity.findFirst({
      where,
      orderBy: { id: 'asc' },
      skip: daySeed() % total,
    })
  } catch (err) {
    console.error('[oppidx] getOpportunityOfTheDay: database unreachable —', err instanceof Error ? err.message : err)
    return null
  }
}

export const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  EARLY_CAREER: 'Early Career',
  FOUNDER: 'Founder',
  GENERAL: 'General',
}
