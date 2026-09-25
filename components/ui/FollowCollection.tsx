'use client'

import { useEffect, useState } from 'react'
import { getStoredReferralCode } from '@/lib/clientReferral'

/**
 * "Tell me when something new lands here."
 *
 * The missing half of the notification system. Web push was fully built —
 * VAPID keys, service worker, subscription storage — and the only thing it
 * could match on was the audience of whatever you'd previously saved, which
 * meant one saved student internship signed you up for every new student
 * listing on the board. This is the explicit, revocable statement of
 * interest that lets lib/push.ts send something worth receiving.
 *
 * Deliberately does not require notification permission to follow: the
 * interest outlives any one browser, and it should already be on file if
 * someone later grants permission or opens the weekly email.
 */
export function FollowCollection({ slug, title }: { slug: string; title: string }) {
  const [following, setFollowing] = useState(false)
  const [known, setKnown] = useState(false)
  const [needsEmail, setNeedsEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/alerts')
      .then(r => r.json())
      .then(data => setFollowing((data.slugs ?? []).includes(slug)))
      .catch(() => {})
      .finally(() => setKnown(true))
  }, [slug])

  async function call(method: 'POST' | 'DELETE', withEmail?: string) {
    return fetch('/api/alerts', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionSlug: slug, email: withEmail, ref: getStoredReferralCode() }),
    })
  }

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await call(following ? 'DELETE' : 'POST')
      if (res.status === 401) setNeedsEmail(true)
      else if (res.ok) setFollowing(!following)
      else setError('Could not update.')
    } catch {
      setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await call('POST', email.trim())
      if (res.ok) {
        setFollowing(true)
        setNeedsEmail(false)
      } else {
        setError('That email looks off.')
      }
    } catch {
      setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  // Renders nothing until the current state is known — a button that says
  // "Follow" and then flips to "Following" a beat later reads as a bug.
  if (!known) return null

  if (needsEmail) {
    return (
      <form onSubmit={submitEmail} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          autoFocus
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@school.edu"
          aria-label={`Your email, to hear about new listings in ${title}`}
          style={{
            padding: '7px 10px', borderRadius: 2, border: '1.5px solid var(--line)',
            background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
            fontSize: 12.5, minWidth: 0, flex: '1 1 180px', outline: 'none',
          }}
        />
        <button type="submit" disabled={busy} className="btn-solid" style={{ padding: '7px 14px', fontSize: 12.5 }}>
          {busy ? '…' : 'Notify me'}
        </button>
        {error && <span style={{ fontSize: 11.5, color: 'var(--danger)', flexBasis: '100%' }}>{error}</span>}
      </form>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={following ? 'btn-outline' : 'btn-solid'}
        style={{ padding: '7px 14px', fontSize: 12.5, opacity: busy ? 0.6 : 1 }}
      >
        {/* Not "Notify me about new {title}" — collection titles are already
            noun phrases ("For founders", "Remote & paid"), so interpolating
            them produced "Notify me about new For founders". */}
        {following ? '◆ Notifying you' : '◇ Notify me when something new lands here'}
      </button>
      {error && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}
