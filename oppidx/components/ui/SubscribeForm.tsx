'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredReferralCode } from '@/lib/clientReferral'

export function SubscribeForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')
  const [msg, setMsg] = useState('')

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
      // A real, dedicated URL rather than inline state — see app/subscribed
      // for why (Google Ads conversion tracking needs an actual page to
      // detect, not a client-side state change on the same page).
      router.push('/subscribed')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@school.edu"
        aria-label="Your email address"
        style={{
          flex: '1 1 200px', minWidth: 0,
          padding: '10px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
          background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
          fontSize: 13, outline: 'none',
        }}
      />
      <button type="submit" disabled={state === 'sending'} className="btn-solid" style={{ padding: '10px 20px', fontSize: 13 }}>
        {state === 'sending' ? 'Joining…' : 'Join the list'}
      </button>
      {state === 'error' && <span style={{ fontSize: 12, color: 'var(--danger)', flexBasis: '100%' }}>{msg}</span>}
    </form>
  )
}
