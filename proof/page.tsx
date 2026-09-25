import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'
import { opportunityPath } from '@/lib/slug'
import { outcomeStats, publicOutcomes, OUTCOME_PUBLIC_LABEL, OUTCOME_COLOR } from '@/lib/outcomes'

export const metadata: Metadata = pageMetadata({
  title: 'Does this actually work? — OppIDX',
  description: 'Every outcome Chasers have reported on OppIDX — the ones that worked and the ones that didn’t, with the denominator. Not testimonials.',
  canonical: `${SITE_URL}/proof`,
})

// Outcomes arrive continuously and the honest version of this page is the
// current one; a cached copy would show a stale denominator.
export const dynamic = 'force-dynamic'

/**
 * The board's track record, or an honest admission that there isn't one yet.
 *
 * Two rules make this page worth trusting, and both cost it impressiveness.
 * First, the denominator is always shown: "N got it" without "out of M
 * reported" is the sort of number /manifesto exists to refuse. Second,
 * rejections and silences appear next to the wins, because a page that only
 * lists successes is a testimonial wall, and everyone already knows to
 * discount those.
 *
 * When too few outcomes exist to say anything real, it says so rather than
 * padding with three anecdotes.
 */
export default async function ProofPage() {
  const [stats, outcomes] = await Promise.all([outcomeStats(), publicOutcomes(24)])

  return (
    <div style={{ padding: '30px var(--gutter) 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
          ◆ Track record
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 34px)', lineHeight: 1.25, marginBottom: 12, textWrap: 'balance' }}>
          Does this actually work?
        </h1>
        <p style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.7, marginBottom: 26, maxWidth: 60 + 'ch' }}>
          Every number here comes from a Chaser who recorded what happened to something they went after —
          including the times it didn&apos;t work out. Nobody was asked for a testimonial. Nothing is
          inferred from clicks.
        </p>

        {stats === null ? (
          <div className="card-box card-pad-lg" style={{ marginBottom: 30 }}>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              Not enough outcomes have been recorded yet to say anything honest. Rather than fill this page
              with three stories and imply a pattern, it stays empty until the numbers mean something.
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7, marginTop: 12 }}>
              If you&apos;ve chased something from this board,{' '}
              <Link href="/saved" style={{ color: 'var(--pin)' }}>record how it went</Link> — that&apos;s
              the only thing this page is ever built from.
            </p>
          </div>
        ) : (
          <div className="card-box card-pad-lg" style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--green)', lineHeight: 1 }}>
                  {stats.gotIt.toLocaleString()}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>got what they chased</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--ink)', lineHeight: 1 }}>
                  {stats.reported.toLocaleString()}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>outcomes reported in total</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--ink-3)', lineHeight: 1 }}>
                  {stats.stillOpen.toLocaleString()}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>applied, still waiting</div>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.65, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              The middle number is the one most boards leave out. {stats.gotIt.toLocaleString()} out of{' '}
              {stats.reported.toLocaleString()} is the real rate, and it includes every rejection and every
              application that was never answered.
            </p>
          </div>
        )}

        {outcomes.length > 0 && (
          <>
            <div className="divider" style={{ marginBottom: 18 }}><span>◆ What people said ◆</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {outcomes.map(o => (
                <div key={`${o.opportunityId}-${o.at}`} className="card-box" style={{ padding: '15px 17px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em', color: OUTCOME_COLOR[o.outcome],
                    }}>
                      A Chaser {OUTCOME_PUBLIC_LABEL[o.outcome]}
                    </span>
                  </div>
                  <Link
                    href={opportunityPath({ id: o.opportunityId, slug: o.opportunitySlug })}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)', textDecoration: 'none', lineHeight: 1.35 }}
                  >
                    {o.opportunityTitle}
                  </Link>
                  {o.opportunityOrg && (
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{o.opportunityOrg}</div>
                  )}
                  {o.note && (
                    <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 9, borderLeft: '2px solid var(--line)', paddingLeft: 11 }}>
                      {o.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 16, lineHeight: 1.6 }}>
              Shown without names, and only where the person explicitly agreed to share. Outcomes recorded
              privately still count toward the numbers above.
            </p>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Link href="/browse" className="btn-solid" style={{ padding: '12px 24px', fontSize: 13.5 }}>
            ◆ Find something worth chasing
          </Link>
        </div>
      </div>
    </div>
  )
}
