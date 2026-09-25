'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export function NotifyButton() {
  const [state, setState] = useState<'unknown' | 'off' | 'on' | 'needsEmail' | 'busy' | 'unsupported'>('unknown')
  const [email, setEmail] = useState('')
  const [pendingSubscription, setPendingSubscription] = useState<PushSubscription | null>(null)

  useEffect(() => {
    let cancelled = false
    // Every path resolves to the next state and lands in a single setState off
    // a microtask, rather than the unsupported branch setting state
    // synchronously in the effect body — that ran a second render pass before
    // the browser ever painted (react-hooks/set-state-in-effect).
    //
    // getRegistration() resolves immediately (undefined if nothing's
    // registered yet) — unlike .ready, which hangs forever until a service
    // worker becomes active, which never happens before the user opts in.
    Promise.resolve()
      .then(() => {
        if (!supported()) return 'unsupported' as const
        return navigator.serviceWorker.getRegistration()
          .then(reg => reg?.pushManager.getSubscription() ?? null)
          .then(sub => sub ? ('on' as const) : ('off' as const))
      })
      .catch(() => 'off' as const)
      .then(next => { if (!cancelled) setState(next) })
    return () => { cancelled = true }
  }, [])

  async function submitSubscription(sub: PushSubscription, emailOverride?: string) {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), email: emailOverride }),
    })
    if (res.status === 401) {
      setPendingSubscription(sub)
      setState('needsEmail')
      return
    }
    setState(res.ok ? 'on' : 'off')
  }

  async function enable() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) { setState('unsupported'); return }
    setState('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('off'); return }

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      await submitSubscription(sub)
    } catch {
      setState('off')
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingSubscription || !email.trim()) return
    setState('busy')
    await submitSubscription(pendingSubscription, email.trim())
  }

  async function disable() {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      setState('on')
    }
  }

  if (state === 'unsupported' || state === 'unknown') return null

  if (state === 'needsEmail') {
    return (
      <form onSubmit={submitEmail} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          autoFocus type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          style={{
            padding: '8px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
            background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
            fontSize: 12.5, outline: 'none', minWidth: 0, flex: '1 1 180px',
          }}
        />
        <button type="submit" style={{
          padding: '8px 16px', borderRadius: 2, border: 'none', cursor: 'pointer',
          background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
          fontSize: 12.5, fontWeight: 700,
        }}>
          Enable
        </button>
      </form>
    )
  }

  return (
    <button
      onClick={state === 'on' ? disable : enable}
      disabled={state === 'busy'}
      style={{
        padding: '9px 18px', borderRadius: 2, cursor: 'pointer',
        border: `1.5px solid ${state === 'on' ? 'var(--pin)' : 'var(--line)'}`,
        background: state === 'on' ? 'var(--pin)' : 'var(--card)',
        color: state === 'on' ? 'var(--btn-text)' : 'var(--ink)',
        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12.5,
      }}
    >
      {state === 'busy' ? '…' : state === 'on' ? '🔔 Notifications on' : '🔕 Notify me about new matches'}
    </button>
  )
}
