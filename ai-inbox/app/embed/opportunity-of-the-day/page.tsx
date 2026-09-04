import { getOpportunityOfTheDay, AUDIENCE_LABEL } from '@/lib/dailyPicks'
import { SITE_URL } from '@/lib/siteUrl'
import { opportunityPath } from '@/lib/slug'

/**
 * GET /embed/opportunity-of-the-day — meant to be loaded in an <iframe> on a
 * third-party blog or newsletter archive page, not visited directly. No nav,
 * no footer, no back link to "home" — just the badge itself, sized to fill
 * whatever box the embedder gives it. Every exit link opens in a new tab
 * (target="_blank") since a click here should never navigate the host
 * page's iframe away from its own src.
 */
export const metadata = {
  robots: { index: false, follow: true }, // this URL itself shouldn't rank; the opportunity pages it links to already do
}

// Otherwise this would render once at build time and never change — an ISR
// refresh every hour is plenty for a badge that only rolls over once a day,
// and much cheaper than re-querying on every embed impression across
// however many third-party sites end up loading it.
export const revalidate = 3600

export default async function OpportunityOfTheDayEmbed() {
  const opp = await getOpportunityOfTheDay()

  return (
    <div style={{
      boxSizing: 'border-box',
      minHeight: 140,
      padding: '14px 16px',
      background: 'var(--card)',
      border: '1.5px solid var(--line)',
      borderRadius: 4,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      color: 'var(--ink)',
    }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 8,
        }}>
          ◆ Opportunity of the Day
        </div>

        {opp ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, lineHeight: 1.35, marginBottom: 4, color: 'var(--ink)' }}>
              {opp.title}
            </div>
            {opp.org && (
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>{opp.org}</div>
            )}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
              {[AUDIENCE_LABEL[opp.audience] ?? opp.audience, opp.difficulty, opp.location].filter(Boolean).join(' · ')}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>New picks land daily on OppIDX.</div>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)',
      }}>
        <a
          href={opp ? `${SITE_URL}${opportunityPath(opp)}` : `${SITE_URL}/browse`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none' }}
        >
          View &amp; apply →
        </a>
        <a
          href={SITE_URL} target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: 'var(--font-display)', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          <span style={{ color: 'var(--ink)' }}>Opp</span><span style={{ color: 'var(--terracotta)' }}>IDX</span>
        </a>
      </div>
    </div>
  )
}
