import Link from 'next/link'
import { OpportunityCard } from '@/components/ui/OpportunityCard'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { FollowCollection } from '@/components/ui/FollowCollection'
import { ListingPageSchema } from '@/components/ui/ListingPageSchema'
import { collectionPath } from '@/lib/collectionPaths'
import type { CollectionDef } from '@/lib/collectionDefs'
import type { Opportunity } from '@/types'

/**
 * Crawlable pagination.
 *
 * Real `<a href>` links, rendered on the server, deliberately — this is the
 * whole point of the component. Before it existed, collection pages showed
 * the first 96 matches and stopped, which left 1,295 of 2,385 listings with
 * no internal link pointing at them from anywhere on the site. Googlebot
 * knew those URLs only from the sitemap, and a sitemap is a discovery hint
 * rather than a reason to crawl; Search Console reported 2,120 pages as
 * "Discovered – currently not indexed", which is exactly what that state
 * looks like. A "Load more" button would have been useless here, since
 * Googlebot doesn't click.
 *
 * Numbers around the current page rather than every page: a 16-page
 * collection shouldn't emit 16 links from every one of its pages, and the
 * first/last anchors keep the whole range reachable in two hops regardless.
 */
function Pagination({ slug, page, pageCount }: { slug: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null

  const window = 2
  const numbers: number[] = []
  for (let n = Math.max(1, page - window); n <= Math.min(pageCount, page + window); n++) numbers.push(n)
  if (numbers[0] !== 1) numbers.unshift(1)
  if (numbers[numbers.length - 1] !== pageCount) numbers.push(pageCount)

  const linkStyle: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
    background: 'var(--card)', color: 'var(--ink)', textDecoration: 'none',
    fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700,
  }
  const currentStyle: React.CSSProperties = {
    ...linkStyle, background: 'var(--pin)', color: 'var(--btn-text)', borderColor: 'var(--pin)',
  }

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '10px 0 30px' }}>
      {page > 1 && (
        <Link href={collectionPath(slug, page - 1)} rel="prev" style={linkStyle}>← Previous</Link>
      )}
      {numbers.map((n, i) => (
        <span key={n} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {i > 0 && numbers[i - 1] !== n - 1 && (
            <span aria-hidden style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>…</span>
          )}
          {n === page
            ? <span aria-current="page" style={currentStyle}>{n}</span>
            : <Link href={collectionPath(slug, n)} style={linkStyle}>{n}</Link>}
        </span>
      ))}
      {page < pageCount && (
        <Link href={collectionPath(slug, page + 1)} rel="next" style={linkStyle}>Next →</Link>
      )}
    </nav>
  )
}

/**
 * The whole collection page, shared by `/collections/[slug]` (page 1) and
 * `/collections/[slug]/page/[n]` (the rest), so the two can't drift apart.
 */
export function CollectionView({
  def,
  slug,
  items,
  total,
  restricted,
  page,
  pageCount,
}: {
  def: CollectionDef
  slug: string
  items: Opportunity[]
  total: number
  restricted: boolean
  page: number
  pageCount: number
}) {
  return (
    <div>
      <ListingPageSchema
        title={def.pageTitle}
        description={def.description}
        path={collectionPath(slug, page)}
        items={items}
      />
      <header style={{ padding: '40px var(--gutter) 24px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Breadcrumbs items={[
            { name: 'OppIDX', href: '/' },
            { name: 'Collections', href: '/collections' },
            { name: def.title, href: `/collections/${slug}` },
          ]} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4.5vw, 38px)', color: 'var(--ink)', marginTop: 14, textTransform: 'uppercase' }}>
            {def.title}
            {page > 1 && <span style={{ color: 'var(--ink-3)' }}> — page {page}</span>}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 10, maxWidth: 640, lineHeight: 1.65 }}>
            {def.description} {total.toLocaleString()} real opportunities right now.
          </p>
          {/* Only on page 1 — following a collection is a single decision, and
              repeating the control on every page invites someone to wonder
              whether they're following "page 4" of something. */}
          {page === 1 && (
            <div style={{ marginTop: 16 }}>
              <FollowCollection slug={slug} title={def.title} />
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px var(--gutter) 80px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Nothing here yet — check back soon.
          </div>
        ) : (
          <div className="card-grid" style={{ ['--card-min' as string]: '260px', marginBottom: 24 }}>
            {items.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
          </div>
        )}

        {pageCount > 1 && (
          <div style={{ textAlign: 'center', marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Page {page} of {pageCount} · {total.toLocaleString()} in total
          </div>
        )}

        <Pagination slug={slug} page={page} pageCount={pageCount} />

        {restricted && (
          <div className="card-box" style={{ textAlign: 'center', padding: '26px var(--gutter)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
              {(total - items.length).toLocaleString()} more are subscriber-only.
            </div>
            <Link href="/pricing" className="btn-solid" style={{ padding: '11px 22px', fontSize: 13 }}>
              Unlock full search — ₹299/yr
            </Link>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <Link href="/collections" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            See all collections →
          </Link>
        </div>
      </main>
    </div>
  )
}
