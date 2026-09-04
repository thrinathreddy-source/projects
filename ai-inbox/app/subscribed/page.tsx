import Link from 'next/link'

export const metadata = {
  title: "You're on the list — OppIDX",
  robots: { index: false, follow: true }, // a confirmation step, not content worth ranking
}

/**
 * Landed on after a successful newsletter signup (see SubscribeForm in
 * app/page.tsx and ScrollSubscribePrompt) — a real, dedicated URL rather
 * than an inline success message, specifically so it can serve as a
 * genuine conversion-tracking destination (e.g. Google Ads' page-visit
 * based conversion detection) instead of counting a homepage visit as a
 * "lead," which wouldn't mean anything.
 */
export default function SubscribedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card-box" style={{ padding: '36px 32px', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ color: 'var(--pin)', marginBottom: 14 }}>◆</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 12 }}>
          You&apos;re on the list.
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.7 }}>
          Check your inbox for a welcome note now, then the week&apos;s top 10 — ranked by genuine interest, not sponsorship — every Monday.
        </p>
        <Link href="/" style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 2,
          background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
        }}>
          Back to OppIDX →
        </Link>
      </div>
    </div>
  )
}
