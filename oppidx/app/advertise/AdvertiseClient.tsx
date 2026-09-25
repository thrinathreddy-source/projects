'use client'

import { useState } from 'react'
import Link from 'next/link'

const EMPTY_FORM = { companyName: '', contactName: '', contactEmail: '', website: '', message: '' }

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 14,
  }
}

export default function AdvertiseClient() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/advertise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card-box" style={{ padding: '30px 28px', maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', marginBottom: 10 }}>
            Got it.
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.6 }}>
            We&apos;ll reach out at the email you gave us within 24 hours.
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

  return (
    <div style={{ minHeight: '100vh', padding: '40px var(--gutter) 80px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ marginBottom: 6 }}>
          <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}>← Back</Link>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 34px)',
          lineHeight: 1.15, marginBottom: 10, textTransform: 'uppercase', color: 'var(--ink)',
        }}>
          Advertise on OppIDX
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 24, lineHeight: 1.6 }}>
          No fixed price, no self-serve checkout — tell us about your company and what you have in mind, we&apos;ll work out a deal that fits, and we&apos;ll get back to you within 24 hours.
        </p>

        <form onSubmit={submit}>
          <input style={inputStyle()} placeholder="Company name" required value={form.companyName} onChange={e => set('companyName', e.target.value)} />
          <input style={inputStyle()} placeholder="Your name" required value={form.contactName} onChange={e => set('contactName', e.target.value)} />
          <input style={inputStyle()} type="email" placeholder="Contact email" required value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          <input style={inputStyle()} placeholder="Website (optional)" value={form.website} onChange={e => set('website', e.target.value)} />
          <textarea style={{ ...inputStyle(), minHeight: 100, resize: 'vertical' }} placeholder="What did you have in mind? (10+ characters)" required value={form.message} onChange={e => set('message', e.target.value)} />

          {state === 'error' && (
            <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>
          )}

          <button type="submit" disabled={state === 'sending'} style={{
            padding: '11px var(--gutter)', borderRadius: 2, border: 'none', cursor: 'pointer',
            background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
            fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '3px 3px 0 var(--shadow)',
          }}>
            {state === 'sending' ? 'Sending…' : 'Send inquiry'}
          </button>
        </form>
      </div>
    </div>
  )
}
