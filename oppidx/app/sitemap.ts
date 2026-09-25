import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/siteUrl'
import { opportunityPath } from '@/lib/slug'
import { listOrEmpty } from '@/lib/buildParams'
import { matchPool } from '@/lib/opportunityPool'
import { collectionPageCount } from '@/lib/collections'
import { collectionPath } from '@/lib/collectionPaths'
import { PAYWALL_ENABLED } from '@/lib/limits'
import { getAllCollectionDefs } from '@/lib/collections'
import { getCompanyList } from '@/lib/companies'
import { getRegionList } from '@/lib/regions'
import { supabaseAdmin } from '@/lib/platform/supabase'

// Without this, sitemap.ts has no request-time API and no dynamic config,
// so Next prerenders it once at build time and freezes it there — new
// opportunities added by the hourly scraper (a DB write, not a deploy)
// would never appear until the next actual code push. Matches the
// scraper's own cadence (lib/scraper/scheduler.ts), so a new listing
// shows up in the sitemap within the hour, not "whenever someone next
// changes code."
export const revalidate = 3600

// `lastModified` below is deliberately NOT always "now" — Search Console
// and Google's own sitemap docs treat lastmod as a claim about real content
// change, and a sitemap that stamps every URL with the current instant on
// every regeneration (this ran hourly) teaches Googlebot the signal is
// unreliable, which makes it fall back to slower heuristic recrawl timing
// for the whole site — including the pages that genuinely do change every
// hour. Only routes whose content is actually live-computed from the
// database on every request (the feed, the live board) get `new Date()`;
// static informational pages get a fixed date that only moves when someone
// deliberately updates it alongside a real content change.
const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified?: Date }> = [
  { path: '', changeFrequency: 'hourly', priority: 1 },
  { path: '/browse', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/collections', changeFrequency: 'daily', priority: 0.8 },
  { path: '/companies', changeFrequency: 'daily', priority: 0.8 },
  { path: '/regions', changeFrequency: 'daily', priority: 0.8 },
  { path: '/resources', changeFrequency: 'daily', priority: 0.8 },
  { path: '/pulse', changeFrequency: 'daily', priority: 0.7 },
  // The split-out product's old URL is deliberately absent: it 308s to its own
  // domain now (see next.config.ts), and listing a redirect in a sitemap is a
  // crawl-budget waste.
  // Priority raised from the 0.5 /philosophy carried: this is the page that
  // states what the board is for, it's now in the site nav and linked from
  // every footer, and it's the one URL here written to be forwarded rather
  // than searched for. /philosophy itself is deliberately absent — it 308s
  // here now, and listing a redirect in a sitemap is a crawl-budget waste.
  { path: '/manifesto', changeFrequency: 'monthly', priority: 0.9, lastModified: new Date('2026-08-06') },
  // The board's own track record. 'daily' because it's rebuilt from live
  // outcome rows on every request, not from a file someone edits.
  { path: '/proof', changeFrequency: 'daily', priority: 0.7 },
  ...(PAYWALL_ENABLED ? [{ path: '/pricing', changeFrequency: 'monthly' as const, priority: 0.5, lastModified: new Date('2026-08-01') }] : []),
  // Matching stayed on OppIDX when the standalone product split off, so its
  // two content pages belong here. /match/interview is deliberately absent —
  // it's the intake form itself, noindex'd, and a search result dropping
  // someone mid-flow helps nobody (see its layout.tsx).
  { path: '/match/philosophy', changeFrequency: 'monthly', priority: 0.5, lastModified: new Date('2026-08-15') },
  { path: '/match/compatibility', changeFrequency: 'monthly', priority: 0.5, lastModified: new Date('2026-08-15') },
  { path: '/match/terms', changeFrequency: 'yearly', priority: 0.2, lastModified: new Date('2026-08-15') },
  { path: '/advertise', changeFrequency: 'monthly', priority: 0.4, lastModified: new Date('2026-08-01') },
  { path: '/widget', changeFrequency: 'monthly', priority: 0.3, lastModified: new Date('2026-08-01') },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2, lastModified: new Date('2026-08-01') },
]

// Events live in Supabase, not Prisma (see lib/platform/supabase.ts) — a
// separate query, and `supabaseAdmin` is null in any environment missing
// the service-role env vars, so this degrades to "no event URLs" rather
// than breaking the whole sitemap.
async function getListedEvents() {
  if (!supabaseAdmin) return []
  const { data } = await supabaseAdmin
    .from('events')
    .select('slug, created_at')
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .eq('is_listed', true)
  return data ?? []
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Every entry below degrades to [] when the database is unreachable, so a
  // preview build (no Production env vars) still emits a valid sitemap of the
  // static routes instead of aborting. getCompanyList/getRegionList/
  // getAllCollectionDefs already guard themselves; these raw queries need it
  // explicitly. See lib/buildParams.ts.
  const [opportunities, resources, pulseDigests, companies, collections, regions, events] = await Promise.all([
    listOrEmpty('sitemap:opportunities', () => prisma.opportunity.findMany({
      where: { verified: true, deletedAt: null },
      select: { id: true, slug: true, addedAt: true },
      orderBy: { addedAt: 'desc' },
    })),
    listOrEmpty('sitemap:resources', () => prisma.resource.findMany({
      where: { verified: true, deletedAt: null },
      select: { id: true, addedAt: true },
      orderBy: { addedAt: 'desc' },
    })),
    listOrEmpty('sitemap:pulseDigests', () => prisma.policyDigest.findMany({ select: { period: true, createdAt: true } })),
    getCompanyList(),
    getAllCollectionDefs(),
    getRegionList(),
    getListedEvents(),
  ])

  // Cached and shared with the collection pages themselves, so counting pages
  // here costs nothing extra (lib/opportunityPool.ts).
  const pool = await matchPool()

  // The newest listing anywhere on the board. Every listing page regenerates
  // on the same hourly window (see the `revalidate` export on each route), so
  // for a collection/company/region page "when did this last actually change"
  // is "when did the newest listing it contains arrive" — a real claim,
  // unlike the `new Date()` these three used to carry.
  //
  // That mattered more than it looks. lastmod is a claim about content, and a
  // sitemap that stamps the current instant on every URL each time it
  // regenerates teaches Googlebot the signal is unreliable for the whole
  // site — the exact failure the note at the top of this file warns about,
  // which these entries were nonetheless committing.
  //
  // `opportunities` and `pool` are both ordered addedAt-desc, so the first
  // match is the newest one — no scan of the rest needed.
  const newestOverall = opportunities[0]?.addedAt ?? new Date()
  const newestMatching = (match: (o: (typeof pool)[number]) => boolean) =>
    pool.find(match)?.addedAt ?? newestOverall

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(r => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: r.lastModified ?? new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const opportunityEntries: MetadataRoute.Sitemap = opportunities.map(o => ({
    url: `${SITE_URL}${opportunityPath(o)}`,
    lastModified: o.addedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const resourceEntries: MetadataRoute.Sitemap = resources.map(r => ({
    url: `${SITE_URL}/resources/${r.id}`,
    lastModified: r.addedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const pulseDigestEntries: MetadataRoute.Sitemap = pulseDigests.map(p => ({
    url: `${SITE_URL}/pulse/digest/${p.period}`,
    lastModified: p.createdAt,
    changeFrequency: 'yearly',
    priority: 0.5,
  }))

  // Page 1 plus every paginated page of every collection. The paginated URLs
  // are what make the whole board reachable by following links rather than
  // only from this file — see components/ui/CollectionView.tsx. Listed at a
  // lower priority than page 1, which stays the entry point.
  const collectionEntries: MetadataRoute.Sitemap = collections.flatMap(c => {
    const total = pool.filter(c.match).length
    const pageCount = collectionPageCount(total)
    const basePriority = c.group === 'Combo' ? 0.6 : 0.85
    const lastModified = newestMatching(c.match)
    return Array.from({ length: pageCount }, (_, i) => ({
      url: `${SITE_URL}${collectionPath(c.slug, i + 1)}`,
      lastModified,
      changeFrequency: 'hourly' as const,
      priority: i === 0 ? basePriority : Math.round((basePriority - 0.2) * 100) / 100,
    }))
  })

  const companyEntries: MetadataRoute.Sitemap = companies.map(c => ({
    url: `${SITE_URL}/companies/${c.slug}`,
    lastModified: c.newest ?? newestOverall,
    changeFrequency: 'daily',
    priority: 0.65,
  }))

  const regionEntries: MetadataRoute.Sitemap = regions.map(r => ({
    url: `${SITE_URL}/regions/${r.slug}`,
    lastModified: r.newest ?? newestOverall,
    changeFrequency: 'daily',
    priority: 0.65,
  }))

  const eventEntries: MetadataRoute.Sitemap = events.map(e => ({
    url: `${SITE_URL}/events/${e.slug}`,
    lastModified: e.created_at ? new Date(e.created_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  return [
    ...staticEntries, ...opportunityEntries, ...resourceEntries,
    ...pulseDigestEntries, ...collectionEntries, ...companyEntries, ...regionEntries, ...eventEntries,
  ]
}
