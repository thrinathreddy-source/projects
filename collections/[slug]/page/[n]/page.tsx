import { notFound, permanentRedirect } from 'next/navigation'
import { CollectionView } from '@/components/ui/CollectionView'
import {
  getCollectionOpportunities,
  getAllCollectionDefs,
  resolveCollectionDef,
  collectionPageCount,
} from '@/lib/collections'
import { matchPool } from '@/lib/opportunityPool'
import { collectionPath } from '@/lib/collectionPaths'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'
import { listOrEmpty } from '@/lib/buildParams'

/**
 * Pages 2..n of a collection. Page 1 lives at the bare `/collections/[slug]`
 * URL — see lib/collectionPaths.ts for why it isn't duplicated here.
 *
 * These exist so Googlebot can walk the whole board by following links.
 * Without them, a collection showed its first 96 matches and stopped, and the
 * remaining listings had no internal link anywhere on the site.
 */
/** Same hourly regeneration as page 1 — see app/collections/[slug]/page.tsx.
 * These pages carry the deep half of the board's internal linking, so a frozen
 * copy is the difference between a new listing being linked-to and being
 * sitemap-only. */
export const revalidate = 3600

export async function generateStaticParams() {
  const defs = await listOrEmpty('/collections/[slug]/page/[n]', getAllCollectionDefs)
  if (defs.length === 0) return []

  // One pool read for every collection's page count, rather than one per
  // collection — the read is already memoised (lib/opportunityPool.ts), but
  // going through it explicitly keeps the intent obvious.
  const pool = await matchPool()

  return defs.flatMap(def => {
    const total = pool.filter(def.match).length
    const pageCount = collectionPageCount(total)
    // Starts at 2: page 1 is the bare slug route.
    return Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => ({
      slug: def.slug,
      n: String(i + 2),
    }))
  })
}

function parsePage(n: string): number | null {
  // Rejects "01", "2.5", "-1", "abc" — one canonical spelling per page, so a
  // crawler can't discover the same content under several URLs.
  if (!/^[1-9][0-9]*$/.test(n)) return null
  return Number(n)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params
  const def = await resolveCollectionDef(slug)
  const page = parsePage(n)
  if (!def || page === null) return { title: 'Page not found — OppIDX' }

  return pageMetadata({
    // Self-referencing canonical, per Google's current guidance on paginated
    // sequences: each page is its own page. Canonicalising them all to page 1
    // would tell Google the other pages don't exist, which is the opposite of
    // what this route is for.
    title: page > 1 ? `${def.pageTitle} — page ${page}` : def.pageTitle,
    description: def.description,
    canonical: `${SITE_URL}${collectionPath(slug, page)}`,
  })
}

export default async function CollectionPaginatedPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params
  const def = await resolveCollectionDef(slug)
  const requested = parsePage(n)
  if (!def || requested === null) notFound()

  // `/page/1` is the same content as the bare slug URL — send it there rather
  // than serving duplicate content at two addresses.
  if (requested === 1) permanentRedirect(collectionPath(slug, 1))

  const pool = await matchPool()
  const total = pool.filter(def.match).length
  const pageCount = collectionPageCount(total)
  // Past the end is genuinely nothing, not an empty page worth indexing.
  if (requested > pageCount) notFound()

  const { items, restricted, page } = await getCollectionOpportunities(def, requested)

  return (
    <CollectionView
      def={def}
      slug={slug}
      items={items}
      total={total}
      restricted={restricted}
      page={page}
      pageCount={pageCount}
    />
  )
}
