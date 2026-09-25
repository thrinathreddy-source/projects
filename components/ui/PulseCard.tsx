import { memo } from 'react'
import Link from 'next/link'

export interface PulseDigest {
  period: string
  summary: string
  itemCount: number
  topCategory: string | null
  createdAt: string
}

function periodLabel(period: string): string {
  const d = new Date(`${period}T00:00:00Z`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** The Knowledge kind — a real, dated snapshot of Pulse's policy
 * feed (see app/api/pulse/recent), interleaved into the opportunities feed
 * rather than living behind its own tab. Deliberately denser and
 * text-only compared to an OpportunityCard — a digest is a dispatch, not
 * a listing. Memoized for the same reason as OpportunityCard: this sits
 * inside pages that re-render on a timer or on unrelated state changes.
 *
 * Wrap in <AnimatedCard> where it genuinely animates (/browse) — see
 * components/ui/AnimatedCard.tsx for why the wrapper is no longer here. */
export const PulseCard = memo(function PulseCard({ digest }: { digest: PulseDigest }) {
  return (
      <div className="card-box" style={{ display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 5, flex: 'none', background: 'var(--terracotta)' }} />
        <div style={{ padding: '16px 18px', flex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
            color: 'var(--terracotta)', fontFamily: 'var(--font-mono)',
          }}>
            ◈ Pulse · {periodLabel(digest.period)}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, lineHeight: 1.4, color: 'var(--ink)', marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {digest.summary}
          </h2>
          <Link
            href={`/pulse/digest/${digest.period}`}
            style={{
              display: 'inline-block', fontSize: 11.5, fontWeight: 700, color: 'var(--pin)',
              textDecoration: 'none', border: '1.5px solid var(--pin)', borderRadius: 2, padding: '6px 12px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Read digest →
          </Link>
        </div>
      </div>
  )
})
