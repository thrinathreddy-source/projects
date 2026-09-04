import Link from 'next/link'
import { getAllCollectionDefs } from '@/lib/collections'
import { getCompanyList } from '@/lib/companies'
import { getRegionList } from '@/lib/regions'

/**
 * A server-rendered index of every way into the board, sitting underneath
 * /browse's client-side search.
 *
 * /browse is the site's second-highest-priority URL (0.9 in the sitemap) and
 * it was serving crawlers a completely empty document — BrowseClient is
 * 'use client' with infinite scroll, so its listings only exist after
 * hydration, and Googlebot indexes a page with no content and no outbound
 * links. That's both a thin-page signal on an important URL and a dead end
 * for discovery.
 *
 * This doesn't touch the search experience — it renders below it, from the
 * server, as plain links. Every collection (including its paginated pages),
 * company and region hub becomes reachable from here, which is genuinely
 * useful to a person scanning for a starting point and is the thing a crawler
 * needs.
 */
export async function BrowseIndex() {
  const [collections, companies, regions] = await Promise.all([
    getAllCollectionDefs(),
    getCompanyList(),
    getRegionList(),
  ])

  // Single-dimension collections only. The generated combos are real pages and
  // stay in the sitemap, but listing all ~110 here would bury the ones people
  // actually navigate by and read as a link dump.
  const primary = collections.filter(c => c.group !== 'Combo')
  const topCompanies = companies.slice(0, 60)

  if (primary.length === 0 && topCompanies.length === 0 && regions.length === 0) return null

  const linkStyle: React.CSSProperties = {
    fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none', lineHeight: 1.5,
  }

  return (
    <section style={{ borderTop: '1px solid var(--line)', marginTop: 20, paddingTop: 34 }}>
      <div className="divider" style={{ marginBottom: 8 }}>
        <span>◆ Every way into the board ◆</span>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 26 }}>
        Prefer to look around rather than search? Start anywhere.
      </p>

      <div style={{ display: 'grid', gap: 30, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <nav aria-label="Collections">
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 12 }}>
            Collections
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {primary.map(c => (
              <Link key={c.slug} href={`/collections/${c.slug}`} style={linkStyle}>{c.title}</Link>
            ))}
          </div>
        </nav>

        {regions.length > 0 && (
          <nav aria-label="Regions">
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 12 }}>
              By region
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {regions.map(r => (
                <Link key={r.slug} href={`/regions/${r.slug}`} style={linkStyle}>
                  {r.region} <span style={{ color: 'var(--ink-3)' }}>({r.count})</span>
                </Link>
              ))}
            </div>
          </nav>
        )}

        {topCompanies.length > 0 && (
          <nav aria-label="Organisations" style={{ gridColumn: 'span 2', minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 12 }}>
              By organisation
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 16px' }}>
              {topCompanies.map(c => (
                <Link key={c.slug} href={`/companies/${c.slug}`} style={linkStyle}>
                  {c.org} <span style={{ color: 'var(--ink-3)' }}>({c.count})</span>
                </Link>
              ))}
            </div>
            {companies.length > topCompanies.length && (
              <div style={{ marginTop: 12 }}>
                <Link href="/companies" style={{ ...linkStyle, color: 'var(--pin)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  All {companies.length.toLocaleString()} organisations →
                </Link>
              </div>
            )}
          </nav>
        )}
      </div>
    </section>
  )
}
