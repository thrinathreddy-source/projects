import Link from 'next/link'
import { getAllCollectionDefs } from '@/lib/collections'
import { SITE_URL } from '@/lib/siteUrl'

export const metadata = {
  title: 'Browse by Audience & Topic — OppIDX',
  description: 'Every real, verified opportunity on OppIDX, organized by audience, topic, location, and compensation.',
  alternates: { canonical: `${SITE_URL}/collections` },
}

export const revalidate = 3600

const GROUPS = ['Audience', 'Topic', 'Location', 'Compensation'] as const

export default async function CollectionsIndexPage() {
  const defs = await getAllCollectionDefs()
  const combos = defs.filter(c => c.group === 'Combo')

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '40px var(--gutter) 24px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
            ← OppIDX
          </Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4.5vw, 38px)', color: 'var(--ink)', marginTop: 14, textTransform: 'uppercase' }}>
            Browse the board
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 10, maxWidth: 640, lineHeight: 1.65 }}>
            Every real, verified opportunity — organized by who it&apos;s for, what it is, where it is, and how it pays.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px var(--gutter) 80px' }}>
        {GROUPS.map(group => {
          const groupDefs = defs.filter(c => c.group === group)
          if (groupDefs.length === 0) return null
          return (
            <div key={group} style={{ marginBottom: 34 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 12 }}>
                By {group.toLowerCase()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px 16px' }}>
                {groupDefs.map(c => (
                  <Link key={c.slug} href={`/collections/${c.slug}`} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 4px',
                    textDecoration: 'none', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 13,
                  }}>
                    <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{c.icon}</span>
                    {c.title}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}

        {combos.length > 0 && (
          <div style={{ marginBottom: 34 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 4 }}>
              Combinations
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
              {combos.length} more, generated from the categories above — each one only exists here because it has real, verified listings behind it.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {combos.map(c => (
                <Link key={c.slug} href={`/collections/${c.slug}`} style={{
                  padding: '6px 12px', borderRadius: 980, border: '1px solid var(--line)',
                  textDecoration: 'none', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 12,
                }}>
                  {c.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 14 }}>
          <Link href="/companies" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            Browse by company →
          </Link>
          <Link href="/regions" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}>
            Browse by region →
          </Link>
        </div>
      </main>
    </div>
  )
}
