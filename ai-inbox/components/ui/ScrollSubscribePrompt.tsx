'use client'

import { useEffect, useState } from 'react'
import { getStoredReferralCode } from '@/lib/clientReferral'

const DISMISS_KEY = 'oppidx_scroll_subscribe_dismissed'
const SCROLL_THRESHOLD_PX = 900

/**
 * Soft, dismissible email capture for /browse — shown once someone has
 * scrolled a real distance into results (seen enough to judge the value),
 * never blocks content. One-shot per browser: a dismissal or a successful
 * subscribe both write DISMISS_KEY so it never nags again.
 */
export function ScrollSubscribePrompt({ itemsSeen, minItemsSeen = 6 }: { itemsSeen: number; minItemsSeen?: number }) {
  const [dismissed, setDismissed] = useState(true) // assume dismissed until localStorage says otherwise — avoids a flash on load
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  useEffect(() => {
    if (dismissed) return
    function onScroll() {
      if (window.scrollY > SCROLL_THRESHOLD_PX && itemsSeen >= minItemsSeen) {
        setVisible(true)
        window.removeEventListener('scroll', onScroll)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [dismissed, itemsSeen, minItemsSeen])

  // This panel is fixed to the bottom of the viewport and, on a phone,
  // spans almost its full width — which is exactly where FloatingRail's
  // buttons sit. Rather than have the two stack on top of each other, the
  // prompt claims the space and the floating rail steps aside for as long
  // as it's up (see `.has-scroll-prompt` in globals.css). The prompt is
  // one-shot and dismissible, so the rail comes back for good very soon.
  useEffect(() => {
    if (!visible) return
    document.body.classList.add('has-scroll-prompt')
    return () => document.body.classList.remove('has-scroll-prompt')
  }, [visible])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ref: getStoredReferralCode() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setState('done')
      localStorage.setItem(DISMISS_KEY, '1')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  if (dismissed || !visible) return null

  return (
    <div style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 40,
      maxWidth: 480, margin: '0 auto',
      background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 4,
      boxShadow: '4px 4px 0 var(--shadow)', padding: '16px 18px',
      animation: 'scrollSubscribeIn 0.25s ease-out',
    }}>
      <style>{`@keyframes scrollSubscribeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13,
        }}
      >
        ✕
      </button>

      {state === 'done' ? (
        <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-mono)', paddingRight: 20 }}>
          ✓ You&apos;re on the list — we&apos;ll email you the best picks.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 10, paddingRight: 20 }}>
            Liking what you see? Get picks like these in your inbox.
          </div>
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@school.edu"
              style={{
                flex: '1 1 180px', padding: '9px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
                background: 'var(--board)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
                fontSize: 13, outline: 'none',
              }}
            />
            <button type="submit" disabled={state === 'sending'} style={{
              padding: '9px 18px', borderRadius: 2, border: 'none', cursor: 'pointer',
              background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
              boxShadow: '3px 3px 0 var(--shadow)',
            }}>
              {state === 'sending' ? '…' : 'Subscribe'}
            </button>
          </form>
          {state === 'error' && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{msg}</div>}
        </>
      )}
    </div>
  )
}
