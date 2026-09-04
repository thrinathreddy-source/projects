import { notFound } from 'next/navigation'
import { CollectionView } from '@/components/ui/CollectionView'
import { getCollectionOpportunities, getAllCollectionDefs, resolveCollectionDef } from '@/lib/collections'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'
import { listOrEmpty } from '@/lib/buildParams'

// Matches the scraper's cadence (lib/scraper/scheduler.ts), for the same
// reason app/sitemap.ts carries it.
//
// Without this, generateStaticParams below prerendered every collection at
// build time and then froze it there: production was serving these pages from
// four-day-old cache entries while the sitemap advertised them as changing
// hourly. Two things broke at once. Listings added by the hourly scraper
// after a deploy had no internal link pointing at them anywhere on the site —
// undoing exactly what paginating these pages was meant to fix, and leaving
// them discoverable only from the sitemap, which is the documented recipe for
// "Discovered – currently not indexed". And repeatedly serving byte-identical
// HTML for a URL claiming an hourly lastmod teaches Googlebot to discount
// that signal site-wide, including on the pages that genuinely do change.
export const revalidate = 3600

export async function generateStaticParams() {
  const defs = await listOrEmpty('/collections/[slug]', getAllCollectionDefs)
  return defs.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const def = await resolveCollectionDef(slug)
  if (!def) return { title: 'Page not found — OppIDX' }
  return pageMetadata({
    title: def.pageTitle,
    description: def.description,
    canonical: `${SITE_URL}/collections/${slug}`,
  })
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const def = await resolveCollectionDef(slug)
  if (!def) notFound()

  const { items, total, restricted, page, pageCount } = await getCollectionOpportunities(def, 1)

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
