import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/db'
import { enrichOpportunities, type CardExtras } from '@/lib/feedEnrichment'
import { parseJsonArray } from '@/lib/safeJson'
import { supabaseAdmin } from '@/lib/platform/supabase'
import type { Opportunity } from '@/types'
import type { PulseDigest } from '@/components/ui/PulseCard'
import type { UpcomingEvent } from '@/components/ui/EventCard'

/**
 * The homepage's first screen, read straight from the database on the
 * server.
 *
 * It used to be assembled in the browser: app/page.tsx rendered a
 * 'use client' component that fired five separate fetches from useEffect,
 * with the board request *chained behind* the featured request. That meant
 * the server HTML for the site's highest-priority URL (sitemap priority 1.0)
 * contained the string "Loading today's picks…" and an empty grid — nothing
 * a crawler could index, and a blank-then-pop for every first-time visitor.
 * These functions exist so the same data can be resolved before the response
 * is sent. The client component still handles infinite scroll from page 2 on,
 * which is genuinely interactive and belongs there.
 */

export const HOME_FEATURED_COUNT = 10

/** Randomised on the server per request, matching the previous client-side
 * behaviour: a genuinely different sample of the board every visit rather
 * than a fixed daily set. Deliberately not cached — the rotation *is* the
 * "keep checking back" hook, and a cached homepage would freeze it. */
function pickRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

/** Prisma returns `addedAt` as a Date; every card component and the
 * /api/opportunities JSON shape both expect an ISO string, and a Date can't
 * cross the server/client boundary as a plain prop anyway. */
function serialize(rows: Array<Record<string, unknown>>): Opportunity[] {
  return rows.map(r => ({
    ...r,
    addedAt: (r.addedAt as Date).toISOString(),
  })) as unknown as Opportunity[]
}

export interface HomeFeedData {
  featured: Opportunity[]
  board: Opportunity[]
  boardTotal: number
  extras: Record<string, CardExtras>
  pulseDigests: PulseDigest[]
  events: UpcomingEvent[]
}

/** Same shape the events API returns, read directly rather than over HTTP.
 * Returns [] rather than throwing when Supabase isn't configured — matching
 * how app/sitemap.ts degrades, so a missing service-role key costs the
 * homepage its event cards and nothing else. */
async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  if (!supabaseAdmin) return []
  try {
    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('id, slug, title, description, category, location, event_time, host_name, capacity')
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .eq('is_listed', true)
      .gte('event_time', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .order('event_time', { ascending: true })
      .limit(12)
    if (error) throw error

    const ids = (events ?? []).map(e => e.id)
    const counts: Record<string, number> = {}
    if (ids.length) {
      const { data: rsvps } = await supabaseAdmin
        .from('event_rsvps')
        .select('event_id')
        .in('event_id', ids)
        .eq('waitlisted', false)
      for (const r of rsvps ?? []) counts[r.event_id] = (counts[r.event_id] || 0) + 1
    }

    return (events ?? []).map(({ id, ...rest }) => ({ ...rest, rsvpCount: counts[id] || 0 })) as UpcomingEvent[]
  } catch (e) {
    console.error('[homeFeed] events:', e instanceof Error ? e.message : 'unknown')
    return []
  }
}

async function getPulseDigests(): Promise<PulseDigest[]> {
  const digests = await prisma.policyDigest.findMany({
    where: { periodType: 'daily' },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  return digests.map(d => {
    // Guarded: this runs inside the homepage's own data path, so a bare
    // JSON.parse meant one malformed digest row 500'd the site's front door.
    const items = parseJsonArray<{ title: string; category: string }>(d.items, `PolicyDigest.items ${d.period}`)
    return {
      period: d.period,
      summary: d.summary,
      itemCount: items.length,
      topCategory: items[0]?.category ?? null,
      createdAt: d.createdAt.toISOString(),
    }
  })
}

/**
 * PAGE_SIZE must stay in step with app/api/opportunities/route.ts — the
 * client picks up at page 2 from that endpoint, so a mismatch here would
 * either skip listings or repeat them across the seam. The client also
 * de-duplicates by id, so a drift shows up as a short page rather than
 * duplicate cards, which is the harder bug to notice.
 */
const PAGE_SIZE = 24

/**
 * How long the homepage's underlying data is reused for.
 *
 * The page is still `force-dynamic` and the picks are still reshuffled on
 * every single request — that rotation is the "check back later" hook and
 * caching it away would freeze it. What is cached is the *input* to the
 * shuffle: six queries (two Prisma reads, a count, the Pulse digests, and
 * two Supabase round trips inside enrichOpportunities) that returned the
 * same rows for every visitor and were re-run from scratch on every hit.
 *
 * Five minutes against a scraper that runs hourly means the board is never
 * meaningfully stale, and a burst of traffic costs one set of queries
 * rather than one set per reader — which is what actually made the page
 * feel slow under load, since Turso and Supabase are both network hops.
 */
const HOME_FEED_TTL_SECONDS = 300

/** Everything on the homepage that is identical for every visitor. Split
 * out purely so it can be wrapped in unstable_cache — the per-request
 * shuffle deliberately stays outside it. */
const getSharedHomeData = unstable_cache(
  async () => {
    const [featuredPool, boardRows, boardTotal, pulseDigests, events] = await Promise.all([
      prisma.opportunity.findMany({
        where: { verified: true, deletedAt: null, featured: true },
        orderBy: { addedAt: 'desc' },
        take: 120, // enough to make the per-visit shuffle feel genuinely fresh
      }),
      prisma.opportunity.findMany({
        where: { verified: true, deletedAt: null },
        orderBy: { addedAt: 'desc' },
        take: PAGE_SIZE,
      }),
      prisma.opportunity.count({ where: { verified: true, deletedAt: null } }),
      getPulseDigests(),
      getUpcomingEvents(),
    ])

    // Enrichment reads `addedAt` as a Date, so it has to happen before the
    // rows are serialized for the client boundary. Done here rather than
    // per-request because it is the most expensive part of the whole page
    // (two Supabase queries plus a groupBy) and its result depends only on
    // which listings are in the pool, not on who is asking.
    const extras = await enrichOpportunities([...featuredPool, ...boardRows])

    return {
      featuredPool: serialize(featuredPool),
      boardRows: serialize(boardRows),
      boardTotal,
      extras,
      pulseDigests,
      events,
    }
  },
  ['home-feed-shared'],
  { revalidate: HOME_FEED_TTL_SECONDS, tags: ['home-feed'] },
)

export async function getHomeFeed(): Promise<HomeFeedData> {
  const { featuredPool, boardRows, boardTotal, extras, pulseDigests, events } = await getSharedHomeData()

  const featuredRows = pickRandom(featuredPool, HOME_FEATURED_COUNT)
  const featuredIds = new Set(featuredRows.map(f => f.id))
  // The board is the whole catalogue; anything already shown in the picks
  // above would otherwise appear twice on the same screen.
  const visibleBoardRows = boardRows.filter(o => !featuredIds.has(o.id))

  return {
    featured: featuredRows,
    board: visibleBoardRows,
    boardTotal,
    extras,
    pulseDigests,
    events,
  }
}
