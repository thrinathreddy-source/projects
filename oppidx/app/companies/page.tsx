import Link from 'next/link'
import { getCompanyList } from '@/lib/companies'
import { SITE_URL } from '@/lib/siteUrl'

export const metadata = {
  title: 'Browse Opportunities by Company — OppIDX',
  description: 'Real internships, jobs, and programs at real companies — verified, not scraped junk.',
  alternates: { canonical: `${SITE_URL}/companies` },
}

export const revalidate = 3600

export default async function CompaniesIndexPage() {
  const companies = await getCompanyList()

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '40px var(--gutter) 24px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
            ← OppIDX
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4.5vw, 38px)', color: 'var(--ink)', marginTop: 14, textTransform: 'uppercase' }}>
            Browse by company
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 10, maxWidth: 640, lineHeight: 1.65 }}>
            {companies.length.toLocaleString()} companies with real, verified listings on the board right now.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px var(--gutter) 80px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {companies.map(c => (
            <Link key={c.slug} href={`/companies/${c.slug}`} className="card-box" style={{
              padding: '10px 16px', textDecoration: 'none', color: 'var(--ink)',
              fontFamily: 'var(--font-mono)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline',
            }}>
              <span style={{ fontWeight: 700 }}>{c.org}</span>
              <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>{c.count}</span>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 30, display: 'flex', gap: 14 }}>
          <Link href="/collections" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            Browse by audience & topic →
          </Link>
          <Link href="/regions" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            Browse by region →
          </Link>
        </div>
      </main>
    </div>
  )
}
