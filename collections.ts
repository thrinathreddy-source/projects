import { prisma } from '@/lib/db'
import { listOrEmpty } from '@/lib/buildParams'
import { matchPool } from '@/lib/opportunityPool'
import { getCurrentPaidSubscriber } from '@/lib/subscriberSession'
import { FREE_SEARCH_LIMIT, PAYWALL_ENABLED } from '@/lib/limits'
import { COLLECTION_DEFS, getCollectionDef, type CollectionDef } from '@/lib/collectionDefs'
import { getGeneratedCombos } from '@/lib/collectionCombos'
import type { Opportunity } from '@/types'

/** Single-dimension defs plus every generated combo that cleared the real
 * listing-count threshold — the full, current set of collection pages.
 *
 * The static defs need no database, so an unreachable one costs the combos
 * and nothing else: the core collections still render. */
export async function getAllCollectionDefs(): Promise<CollectionDef[]> {
  const combos = await listOrEmpty('getGeneratedCombos', getGeneratedCombos)
  return [...COLLECTION_DEFS, ...combos]
}

/** Looks up a slug across both the static defs and the generated combos —
 * a combo slug (e.g. "remote-ai-and-machine-learning") only exists here,
 * not in the static list, so the plain getCollectionDef() lookup misses it. */
export async function resolveCollectionDef(slug: string): Promise<CollectionDef | undefined> {
  return getCollectionDef(slug) ?? (await getGeneratedCombos()).find(c => c.slug === slug)
}

/**
 * Shared fetch for /collections/[slug] pages — same free-tier cap as
 * /browse and the RSS feed, so a collection page can't become an
 * unauthenticated back door around the paywall.
 *
 * Filters in JS rather than pushing every definition into SQL: the board
 * is ~1,800 verified rows (cheap to pull in full), and several collection
 * definitions match on OR'd substrings across a free-text tags column,
 * which SQLite has no clean way to express directly. Every other page that
 * does cross-row matching against the tags column (JobPosting eligibility,
 * the Pulse/Gathering/Resource edges) already follows this same pattern.
 */
/**
 * The most listings a collection page renders.
 *
 * Previously uncapped, so /collections/students emitted 485 full cards and
 * /collections/early-career would emit over a thousand. That's a multi-
 * megabyte HTML document nobody scrolls to the end of, and at build time it
 * was a meaningful share of the per-page export budget. `total` below is
 * still the real, uncapped count, so the page keeps telling the truth about
 * how many exist — it just links to /browse for the rest.
 *
 * Lowered from 96 to 30 after measuring the live pages: at 96,
 * /collections/students was serving 720 KB of HTML for a single page of 96
 * cards, which is an LCP cost paid by every visitor to reach content almost
 * nobody scrolls to.
 *
 * The cut helps twice, which is why 30 rather than something closer to 96.
 * The page gets roughly three times lighter, AND the collection spans three
 * times as many paginated URLs — and those paginated pages are the internal
 * linking that makes individual listings reachable by following links rather
 * than only from the sitemap. Fewer cards per page is *more* crawlable
 * surface, not less.
 */
export const MAX_ITEMS_PER_PAGE = 30

/** Total pages a collection spans at MAX_ITEMS_PER_PAGE, minimum 1. */
export function collectionPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / MAX_ITEMS_PER_PAGE))
}

/**
 * One page of a collection.
 *
 * Paginated rather than capped because the cap alone quietly broke crawling.
 * Rendering only the first 96 matches meant 1,295 of 2,385 listings had no
 * internal link pointing at them anywhere on the site — Googlebot knew them
 * only from the sitemap, which is precisely the condition that produces
 * "Discovered – currently not indexed" (2,120 of them in Search Console).
 * A sitemap is a discovery hint; internal links are what tell Google a page
 * is worth crawling. Collections partition the entire board by audience, so
 * paginating them makes every listing reachable by following links.
 */
export async function getCollectionOpportunities(def: CollectionDef, page = 1) {
  const paidSubscriber = PAYWALL_ENABLED ? await getCurrentPaidSubscriber() : true

  // Match against the cached, minimal pool rather than re-reading every
  // column of every row on this page — see lib/opportunityPool.ts. Only the
  // rows actually being rendered get fetched in full below.
  const pool = await matchPool()
  const matchedIds = pool.filter(def.match).map(r => r.id)
  const total = matchedIds.length
  const pageCount = collectionPageCount(total)
  const current = Math.min(Math.max(1, page), pageCount)

  // The free tier only ever sees the first page's worth — paginating past
  // the paywall would be a back door around it, same rule the RSS feed and
  // /browse already follow.
  const visibleIds = paidSubscriber
    ? matchedIds.slice((current - 1) * MAX_ITEMS_PER_PAGE, current * MAX_ITEMS_PER_PAGE)
    : matchedIds.slice(0, Math.min(FREE_SEARCH_LIMIT, MAX_ITEMS_PER_PAGE))

  const rows = visibleIds.length
    ? await prisma.opportunity.findMany({
        where: { id: { in: visibleIds } },
        orderBy: { addedAt: 'desc' },
      })
    : []

  const items = rows.map(r => ({ ...r, addedAt: r.addedAt.toISOString() })) as unknown as Opportunity[]
  // True only when the paywall is holding something back — deliberately not
  // set merely because pagination is in effect, since that isn't a
  // restriction and the page shouldn't offer to sell its way past it.
  const restricted = !paidSubscriber && total > items.length

  return { items, total, restricted, page: current, pageCount }
}
