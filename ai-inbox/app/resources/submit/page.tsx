'use client'

import { useState } from 'react'
import Link from 'next/link'
import { VALID_AUDIENCES, VALID_CATEGORIES } from '@/lib/resources/validate'

const EMPTY_FORM = {
  title: '', description: '', url: '', category: VALID_CATEGORIES[0], audience: 'GENERAL', submitterEmail: '',
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 14,
  }
}

export default function SubmitResource() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [state, setState] = useState<'idle' | 'checking' | 'done' | 'error'>('idle')
  const [errors, setErrors] = useState<string[]>([])

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('checking')
    setErrors([])
    try {
      const res = await fetch('/api/resources/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.errors ?? [data.error ?? 'Something went wrong.'])
        setState('error')
        return
      }
      setState('done')
    } catch {
      setErrors(['Something went wrong. Try again.'])
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card-box" style={{ padding: '30px 28px', maxWidth: 460, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', marginBottom: 10 }}>
            It&apos;s live.
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.6 }}>
            Your link checked out and is now listed — thank you for adding to the pile.
          </p>
          <Link href="/resources" style={{
            display: 'inline-block', padding: '11px 22px', borderRadius: 2,
            background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
          }}>
            See it on the board →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '40px var(--gutter) 80px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ marginBottom: 6 }}>
          <Link href="/resources" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', textDecoration: 'none' }}>← Back</Link>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 34px)',
          lineHeight: 1.15, marginBottom: 10, textTransform: 'uppercase', color: 'var(--ink)',
        }}>
          Submit a resource
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 24, lineHeight: 1.6 }}>
          Free, no review queue — we check the link is real and not a duplicate automatically, and if it checks out it&apos;s live immediately. We can still remove anything later.
        </p>

        <form onSubmit={submit}>
          <input style={inputStyle()} placeholder="Title" required value={form.title} onChange={e => set('title', e.target.value)} />
          <textarea style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }} placeholder="What is it, and who does it help? (20+ characters)" required value={form.description} onChange={e => set('description', e.target.value)} />
          <input style={inputStyle()} placeholder="URL (https://…)" required value={form.url} onChange={e => set('url', e.target.value)} />
          <select style={inputStyle()} value={form.category} onChange={e => set('category', e.target.value)}>
            {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={inputStyle()} value={form.audience} onChange={e => set('audience', e.target.value)}>
            {VALID_AUDIENCES.map(a => <option key={a} value={a}>{a.replace('_', ' ')}</option>)}
          </select>
          <input style={inputStyle()} type="email" placeholder="Your email (for moderation only, never published)" required value={form.submitterEmail} onChange={e => set('submitterEmail', e.target.value)} />

          {state === 'error' && (
            <div style={{ marginBottom: 14 }}>
              {errors.map((err, i) => (
                <div key={i} style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 4 }}>{err}</div>
              ))}
            </div>
          )}

          <button type="submit" disabled={state === 'checking'} style={{
            padding: '11px var(--gutter)', borderRadius: 2, border: 'none', cursor: 'pointer',
            background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
            fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em', boxShadow: '3px 3px 0 var(--shadow)',
          }}>
            {state === 'checking' ? 'Checking the link…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}
