'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getStoredReferralCode } from '@/lib/clientReferral'

const PLANS = {
  annual:  { price: '₹299', per: '/year',  sub: 'Less than ₹1/day', badge: 'Save 14% vs monthly' },
  monthly: { price: '₹29',  per: '/month', sub: 'Less than ₹1/day', badge: null },
} as const

type Cycle = keyof typeof PLANS

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '11px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13.5, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 14,
  }
}

export default function PricingClient() {
  const [cycle, setCycle] = useState<Cycle>('annual')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showRestore, setShowRestore] = useState(false)
  const [restoreEmail, setRestoreEmail] = useState('')
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'sending' | 'done'>('idle')

  const plan = PLANS[cycle]

  async function subscribe(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cycle, ref: getStoredReferralCode() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      window.location.href = data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  async function restoreAccess(e: React.FormEvent) {
    e.preventDefault()
    setRestoreStatus('sending')
    try {
      await fetch('/api/billing/restore-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: restoreEmail }),
      })
    } finally {
      setRestoreStatus('done')
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Back to OppIDX
        </Link>

        <div className="card-box" style={{ marginTop: 20, padding: '36px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 14 }}>◆</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 8 }}>
              Search everything. Miss nothing.
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              This is a premium, hand-curated collection — free shows 10 fresh picks a day and the first 10
              results of any search, 20 total. Subscribers get full search across every opportunity on the
              board, the instant it&apos;s added.
            </p>
          </div>

          {/* ── Monthly / Annual toggle ── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            {(['annual', 'monthly'] as const).map(c => (
              <button
                key={c} type="button" onClick={() => setCycle(c)}
                style={{
                  padding: '9px 20px', borderRadius: 2, cursor: 'pointer',
                  border: `1.5px solid ${cycle === c ? 'var(--btn-bg)' : 'var(--line)'}`,
                  background: cycle === c ? 'var(--btn-bg)' : 'var(--card)',
                  color: cycle === c ? 'var(--btn-text)' : 'var(--ink)',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
                  textTransform: 'capitalize',
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <div style={{
            textAlign: 'center', padding: '20px 0', marginBottom: 26,
            borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
          }}>
            {plan.badge && (
              <div style={{
                display: 'inline-block', marginBottom: 8, padding: '3px 10px', borderRadius: 20,
                background: 'var(--pin)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                {plan.badge}
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--ink)' }}>
              {plan.price}<span style={{ fontSize: 18 }}>{plan.per}</span>
            </div>
            <div style={{ fontSize: 12.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--pin)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 8 }}>
              {plan.sub} — cancel anytime
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
              Less than your OTT subscription. Less than the data you&apos;ll burn doomscrolling this week. This one buys an authentic shot.
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}>What you get</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--ink-3)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em', width: 60 }}>Free</th>
                <th style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--pin)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em', width: 60 }}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Daily rotating picks', true, true],
                ['First 10 results per search', true, true],
                ['Full search — every opportunity', false, true],
                ['Save & bookmark opportunities', true, true],
                ['Similar-opportunity suggestions', true, true],
                ['Prep resources on listings', true, true],
                ['New-listing notifications', true, true],
                ['Cancel anytime, no lock-in', true, true],
              ].map(([label, free, paid]) => (
                <tr key={label as string} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 4px', color: 'var(--ink-2)' }}>{label as string}</td>
                  <td style={{ padding: '9px 4px', textAlign: 'center', color: free ? 'var(--green)' : 'var(--ink-3)' }}>{free ? '✓' : '—'}</td>
                  <td style={{ padding: '9px 4px', textAlign: 'center', color: paid ? 'var(--green)' : 'var(--ink-3)' }}>{paid ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <form onSubmit={subscribe}>
            <input
              type="email" required placeholder="you@email.com" value={email}
              onChange={e => setEmail(e.target.value)} style={inputStyle()}
            />

            {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px 26px', borderRadius: 2, border: 'none', cursor: 'pointer',
              background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em',
              boxShadow: '4px 4px 0 var(--shadow)',
            }}>
              {loading ? 'Redirecting to checkout…' : `Subscribe — ${plan.price}${plan.per}`}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            {!showRestore ? (
              <button onClick={() => setShowRestore(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)', fontSize: 12,
              }}>
                Already subscribed on another device? Restore access →
              </button>
            ) : restoreStatus === 'done' ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
                If that email is subscribed, this browser now has full access. Refresh the board to check.
              </div>
            ) : (
              <form onSubmit={restoreAccess} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <input
                  type="email" required placeholder="you@email.com" value={restoreEmail}
                  onChange={e => setRestoreEmail(e.target.value)}
                  style={{ ...inputStyle(), marginBottom: 0, width: '100%', maxWidth: 220 }}
                />
                <button type="submit" disabled={restoreStatus === 'sending'} style={{
                  padding: '11px 18px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                  background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
                  fontSize: 12.5, fontWeight: 700,
                }}>
                  {restoreStatus === 'sending' ? '…' : 'Restore'}
                </button>
              </form>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              Have an opportunity to list instead? <Link href="/submit" style={{ color: 'var(--pin)' }}>Submit it — free →</Link>
            </span>
          </div>

          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <Link href="/account" style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
              Manage or cancel your subscription →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
