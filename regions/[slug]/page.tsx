import { notFound } from 'next/navigation'
import Link from 'next/link'
import { OpportunityCard } from '@/components/ui/OpportunityCard'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { ListingPageSchema } from '@/components/ui/ListingPageSchema'
import { getRegionList, getRegionOpportunities, regionBlurb } from '@/lib/regions'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'

/** Hourly, matching the scraper — see app/collections/[slug]/page.tsx.
 * The /regions index already had this; the leaves it links to did not. */
export const revalidate = 3600

export async function generateStaticParams() {
  const regions = await getRegionList()
  return regions.map(r => ({ slug: r.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getRegionOpportunities(slug)
  if (!result) return { title: 'Page not found — OppIDX' }
  return pageMetadata({
    title: `Opportunities in ${result.region} — OppIDX`,
    description: `${result.total.toLocaleString()} real, verified opportunities in ${result.region} — ${regionBlurb(result.region)}`,
    canonical: `${SITE_URL}/regions/${slug}`,
  })
}

export default async function RegionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await getRegionOpportunities(slug)
  if (!result) notFound()

  const { region, items, total, restricted } = result

  return (
    <div style={{ minHeight: '100vh' }}>
      <ListingPageSchema
        title={`Opportunities in ${region}`}
        description={`${total.toLocaleString()} real, verified opportunities in ${region} — ${regionBlurb(region)}`}
        path={`/regions/${slug}`}
        items={items}
      />
      <header style={{ padding: '40px var(--gutter) 24px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Breadcrumbs items={[
            { name: 'OppIDX', href: '/' },
            { name: 'Regions', href: '/regions' },
            { name: region, href: `/regions/${slug}` },
          ]} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4.5vw, 38px)', color: 'var(--ink)', marginTop: 14, textTransform: 'uppercase' }}>
            {region}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 10, maxWidth: 640, lineHeight: 1.65 }}>
            {regionBlurb(region)} {total.toLocaleString()} real opportunities right now.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px var(--gutter) 80px' }}>
        <div className="card-grid" style={{ ['--card-min' as string]: '260px', marginBottom: 30 }}>
          {items.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>

        {restricted && (
          <div className="card-box" style={{ textAlign: 'center', padding: '26px var(--gutter)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
              {(total - items.length).toLocaleString()} more in {region} are subscriber-only.
            </div>
            <Link href="/pricing" style={{
              display: 'inline-block', padding: '11px var(--gutter)', borderRadius: 2,
              background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
            }}>
              Unlock full search — ₹299/yr
            </Link>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <Link href="/regions" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            See all regions →
          </Link>
        </div>
      </main>
    </div>
  )
}
