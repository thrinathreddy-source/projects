'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/authSupabase'
import { PAYWALL_ENABLED } from '@/lib/limits'
import { ShareBar } from '@/components/ui/ShareBar'
import { OpportunityCard } from '@/components/ui/OpportunityCard'
import { SITE_URL } from '@/lib/siteUrl'
import type { Opportunity } from '@/types'

type Status = {
  found: boolean
  email?: string
  isPaid?: boolean
  plan?: string
  subscriptionStatus?: string | null
  currentPeriodEnd?: string | null
  institutionEmail?: string | null
  institutionVerified?: boolean
  referralCode?: string | null
  referralCount?: number
  subscribedToDigest?: boolean
}

type Submission = { id: string; title: string; addedAt: string; status: 'live' | 'pending' | 'rejected' }

const SUBMISSION_STATUS_LABEL: Record<Submission['status'], { label: string; color: string }> = {
  live: { label: '● Live', color: 'var(--green)' },
  pending: { label: '◐ In review', color: 'var(--ink-3)' },
  rejected: { label: '✗ Not approved', color: 'var(--danger)' },
}

const STATUS_MESSAGE: Record<string, { label: string; tone: 'ok' | 'warn' | 'off' }> = {
  active: { label: 'Active — full search unlocked.', tone: 'ok' },
  halted: { label: "There's an issue with your last payment — your card may have been declined. Renew below to keep full access.", tone: 'warn' },
  pending: { label: 'Your first payment is still processing.', tone: 'warn' },
  cancelled: { label: 'Cancelled — back to free, limited search.', tone: 'off' },
  completed: { label: 'This subscription has run its course — back to free, limited search.', tone: 'off' },
}

function toneColor(tone: 'ok' | 'warn' | 'off') {
  if (tone === 'ok') return 'var(--green)'
  if (tone === 'warn') return 'var(--danger)'
  return 'var(--ink-3)'
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
  background: 'var(--board)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13.5, outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 2, border: 'none', cursor: 'pointer',
  background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
  fontSize: 13, fontWeight: 700,
}

export default function AccountPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [cancelState, setCancelState] = useState<'idle' | 'confirming' | 'loading' | 'done'>('idle')

  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authState, setAuthState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [authError, setAuthError] = useState('')

  const [institutionEmailInput, setInstitutionEmailInput] = useState('')
  const [verifyState, setVerifyState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [verifyError, setVerifyError] = useState('')

  const [saved, setSaved] = useState<Opportunity[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [digestToggling, setDigestToggling] = useState(false)
  // True only after a real session cookie exists (login, signup, or an
  // already-active cookie on load) — the passwordless email lookup() below
  // never mints one (see /api/account/status's own comment: "strictly less
  // powerful than restore-access"), so saved/submissions/digest-toggle
  // would silently 401 or return empty for that path. Gates those three
  // sections instead of showing an empty-looking "nothing saved yet" that
  // actually just means "we never checked."
  const [hasSession, setHasSession] = useState(false)

  async function requestVerification(e: React.FormEvent) {
    e.preventDefault()
    setVerifyState('sending')
    setVerifyError('')
    try {
      const res = await fetch('/api/account/verify-institution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionEmail: institutionEmailInput }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setVerifyState('sent')
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Something went wrong.')
      setVerifyState('error')
    }
  }

  const refreshStatus = () =>
    fetch('/api/account/status').then(r => r.json()).then(async (s: Status) => {
      setStatus(s)
      setHasSession(s.found)
      if (s.found) {
        const [savedRes, submissionsRes] = await Promise.all([
          fetch('/api/saved').then(r => r.json()),
          fetch('/api/account/submissions').then(r => r.json()),
        ])
        setSaved(savedRes.items ?? [])
        setSubmissions(submissionsRes.items ?? [])
      }
    })

  useEffect(() => {
    refreshStatus().finally(() => setLoading(false))
  }, [])

  async function toggleDigest() {
    setDigestToggling(true)
    try {
      const res = await fetch('/api/account/newsletter', { method: 'POST' })
      const data = await res.json()
      setStatus(s => s ? { ...s, subscribedToDigest: data.subscribedToDigest } : s)
    } finally {
      setDigestToggling(false)
    }
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setLookupState('loading')
    try {
      const res = await fetch('/api/account/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) { setLookupState('error'); return }
      setStatus(await res.json())
      setHasSession(false)
      setLookupState('idle')
    } catch {
      setLookupState('error')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setAuthState('loading')
    setAuthError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    if (error || !data.session) {
      setAuthState('error')
      setAuthError('Wrong email or password.')
      return
    }
    await fetch('/api/account/link', {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    })
    setAuthState('idle')
    await refreshStatus()
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setAuthState('loading')
    setAuthError('')
    const res = await fetch('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail, password: authPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setAuthState('error')
      setAuthError(data.error || 'Something went wrong.')
      return
    }
    // Account is created server-side (admin API) — that doesn't sign the
    // browser in, so do it explicitly, same as the matching register flow.
    await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    setAuthState('idle')
    await refreshStatus()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    await fetch('/api/account/logout', { method: 'POST' })
    setStatus({ found: false })
    setHasSession(false)
    setSaved([])
    setSubmissions([])
  }

  async function cancelSubscription() {
    setCancelState('loading')
    try {
      await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: status?.email ?? email }),
      })
    } finally {
      setCancelState('done')
      setStatus(s => s ? { ...s, isPaid: false, plan: 'free', subscriptionStatus: 'cancelled' } : s)
    }
  }

  const info = status?.subscriptionStatus ? STATUS_MESSAGE[status.subscriptionStatus] : null

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Back to OppIDX
        </Link>

        <div className="card-box" style={{ marginTop: 20, padding: '32px 28px' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>
            Your account
          </h1>

          {loading ? (
            <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>
          ) : !status?.found ? (
            <>
              <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1.5px solid var(--line)' }}>
                <button
                  onClick={() => { setAuthTab('login'); setAuthState('idle'); setAuthError('') }}
                  style={{
                    padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    color: authTab === 'login' ? 'var(--pin)' : 'var(--ink-3)',
                    borderBottom: authTab === 'login' ? '2px solid var(--pin)' : '2px solid transparent',
                    marginBottom: -1.5,
                  }}
                >
                  Log in
                </button>
                <button
                  onClick={() => { setAuthTab('signup'); setAuthState('idle'); setAuthError('') }}
                  style={{
                    padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    color: authTab === 'signup' ? 'var(--pin)' : 'var(--ink-3)',
                    borderBottom: authTab === 'signup' ? '2px solid var(--pin)' : '2px solid transparent',
                    marginBottom: -1.5,
                  }}
                >
                  Create account
                </button>
              </div>

              <p style={{ color: 'var(--ink-2)', fontSize: 12.5, marginBottom: 16, lineHeight: 1.6 }}>
                Already registered for Match? Log in here with the same email and password — it&apos;s the same account.
              </p>

              <form onSubmit={authTab === 'login' ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                <input
                  type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  placeholder="you@email.com" style={inputStyle}
                />
                <input
                  type="password" required value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  placeholder="Password" style={inputStyle}
                />
                <button type="submit" disabled={authState === 'loading'} style={primaryBtnStyle}>
                  {authState === 'loading' ? 'Please wait…' : authTab === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>
              {authState === 'error' && (
                <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
                  {authError}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
                <p style={{ color: 'var(--ink-3)', fontSize: 12, marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
                  Or just look up an existing subscription by email — no password needed:
                </p>
                <form onSubmit={lookup} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    style={{ ...inputStyle, flex: 1, minWidth: 200, width: 'auto' }}
                  />
                  <button type="submit" disabled={lookupState === 'loading'} style={primaryBtnStyle}>
                    {lookupState === 'loading' ? 'Looking up…' : 'View status'}
                  </button>
                </form>
                {lookupState === 'error' && (
                  <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10, fontFamily: 'var(--font-mono)' }}>
                    Something went wrong. Try again.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{status.email}</div>
                <button onClick={handleLogout} style={{
                  padding: '6px 12px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                  background: 'var(--card)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700,
                }}>
                  Log out
                </button>
              </div>

              {!status.isPaid && !PAYWALL_ENABLED ? (
                <div style={{ padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)', marginBottom: 20 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6 }}>
                    Status
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                    Full search is free for everyone right now — no subscription needed.
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)', marginBottom: 20 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6 }}>
                    Status
                  </div>
                  <div style={{ fontSize: 14, color: info ? toneColor(info.tone) : 'var(--ink)', fontWeight: 600, marginBottom: 4 }}>
                    {status.isPaid ? 'Paid subscriber' : 'Free tier'}
                  </div>
                  {info && (
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{info.label}</div>
                  )}
                  {status.isPaid && status.currentPeriodEnd && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                      Renews {new Date(status.currentPeriodEnd).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  )}
                </div>
              )}

              {!status.isPaid && PAYWALL_ENABLED && (
                <Link href="/pricing" style={{
                  display: 'inline-block', padding: '11px 22px', borderRadius: 2,
                  background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
                }}>
                  {status.subscriptionStatus === 'halted' ? 'Renew subscription →' : 'Subscribe →'}
                </Link>
              )}

              {status.isPaid && cancelState !== 'done' && (
                cancelState === 'confirming' ? (
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
                      Cancel your subscription? This takes effect immediately — no more full search after this.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={cancelSubscription} disabled={cancelState !== 'confirming'} style={{
                        padding: '10px 18px', borderRadius: 2, border: 'none', cursor: 'pointer',
                        background: 'var(--danger)', color: 'white', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                      }}>
                        Yes, cancel
                      </button>
                      <button onClick={() => setCancelState('idle')} style={{
                        padding: '10px 18px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                        background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                      }}>
                        Never mind
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setCancelState('confirming')} style={{
                    padding: '10px 18px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                    background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                  }}>
                    Cancel subscription
                  </button>
                )
              )}

              {cancelState === 'done' && (
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
                  ✓ Cancelled. You&apos;re back on the free tier.
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 8 }}>
                  Verified email (optional)
                </div>
                {status.institutionVerified ? (
                  <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
                    ✓ {status.institutionEmail}
                  </div>
                ) : verifyState === 'sent' ? (
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    Check {institutionEmailInput} for a verification link.
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.6 }}>
                      Prove you control a college or work email — it shows on your profile as-is, so anyone can judge the domain themselves. Free, and never required.
                    </p>
                    <form onSubmit={requestVerification} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="email" required value={institutionEmailInput}
                        onChange={e => setInstitutionEmailInput(e.target.value)}
                        placeholder="you@university.edu"
                        style={{ ...inputStyle, flex: 1, minWidth: 200, width: 'auto' }}
                      />
                      <button type="submit" disabled={verifyState === 'sending'} style={primaryBtnStyle}>
                        {verifyState === 'sending' ? 'Sending…' : 'Send link'}
                      </button>
                    </form>
                    {verifyState === 'error' && (
                      <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8, fontFamily: 'var(--font-mono)' }}>{verifyError}</div>
                    )}
                  </>
                )}
              </div>

              {status.referralCode && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6 }}>
                    Refer friends
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.6 }}>
                    {status.referralCount ? `${status.referralCount} friend${status.referralCount === 1 ? '' : 's'} joined via your link so far.` : 'Share your link — anyone who joins through it counts toward you.'}
                  </p>
                  <div style={{ marginBottom: 10 }}>
                    <ShareBar
                      title="OppIDX — every real opportunity, one honest board"
                      url={`${SITE_URL}/?ref=${status.referralCode}`}
                    />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {SITE_URL}/?ref={status.referralCode}
                  </div>
                </div>
              )}

              {hasSession ? (
                <>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)' }}>
                        Weekly digest email
                      </div>
                      <button onClick={toggleDigest} disabled={digestToggling} style={{
                        padding: '5px 12px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                        background: 'var(--card)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                        opacity: digestToggling ? 0.6 : 1,
                      }}>
                        {status.subscribedToDigest ? 'Unsubscribe' : 'Resubscribe'}
                      </button>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                      {status.subscribedToDigest
                        ? "You're getting the weekly top-10 digest at this email."
                        : "You've unsubscribed from the weekly digest — everything else about your account stays the same."}
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
                      Saved opportunities {saved.length > 0 && `(${saved.length})`}
                    </div>
                    {saved.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                        Nothing saved yet. <Link href="/browse" style={{ color: 'var(--pin)' }}>Browse the board →</Link>
                      </p>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginBottom: 10 }}>
                          {saved.slice(0, 4).map(o => <OpportunityCard key={o.id} opp={o} />)}
                        </div>
                        <Link href="/saved" style={{ fontSize: 12.5, color: 'var(--pin)', fontFamily: 'var(--font-mono)', fontWeight: 700, textDecoration: 'none' }}>
                          See all saved →
                        </Link>
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
                      Your submissions {submissions.length > 0 && `(${submissions.length})`}
                    </div>
                    {submissions.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                        Nothing submitted yet. <Link href="/submit" style={{ color: 'var(--pin)' }}>Enlist an opportunity →</Link>
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {submissions.map(s => (
                          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                            <span style={{ color: 'var(--ink)' }}>
                              {s.status === 'live' ? <Link href={`/opportunities/${s.id}`} style={{ color: 'var(--ink)' }}>{s.title}</Link> : s.title}
                            </span>
                            <span style={{ color: SUBMISSION_STATUS_LABEL[s.status].color, fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {SUBMISSION_STATUS_LABEL[s.status].label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                    This is a read-only lookup by email. Log out and sign in with a password instead to also see saved opportunities, your submissions, and manage your digest preference here.
                  </p>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 20 }}>
                <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  Want to also find a match? <Link href="/account/register" style={{ color: 'var(--terracotta)', textDecoration: 'underline' }}>Fill in your Match profile →</Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
