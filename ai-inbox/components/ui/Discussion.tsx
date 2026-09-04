'use client'

import { useEffect, useState } from 'react'

interface Comment {
  id: string
  body: string
  createdAt: string
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

/** The real discussion thread for one opportunity — the "N comments" line
 * on the card links here. No accounts, same lightweight email-on-first-
 * post identity as saving something (app/api/opportunities/[id]/comments).
 * Comments render with no name attached — this is about the conversation,
 * not building a profile. */
export function Discussion({ opportunityId }: { opportunityId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  const [needsEmail, setNeedsEmail] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/comments`)
      .then(r => r.json())
      .then(data => setComments(data.items ?? []))
      .catch(() => setComments([]))
  }, [opportunityId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setState('sending')
    setError('')
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email: needsEmail ? email : undefined }),
      })
      const data = await res.json()
      if (res.status === 401 && data.error === 'needsEmail') {
        setNeedsEmail(true)
        setState('idle')
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.')
      setComments(prev => [...(prev ?? []), data.item])
      setBody('')
      setState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setState('error')
    }
  }

  return (
    <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
        Discussion {comments && comments.length > 0 ? `(${comments.length})` : ''}
      </div>

      {comments === null ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>Loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 14 }}>
          Nobody&apos;s said anything yet — be the first.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {comments.map(c => (
            <div key={c.id} style={{ borderLeft: '2px solid var(--line)', paddingLeft: 10 }}>
              <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 3 }}>{c.body}</p>
              <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{timeAgo(c.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Anyone else applying? Ask something, share a tip…"
          rows={2}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
            background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
            fontSize: 13, outline: 'none', resize: 'vertical',
          }}
        />
        {needsEmail && (
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@school.edu — so you're not anonymous to spam, everyone else still sees no name"
            style={{
              padding: '9px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
              background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
              fontSize: 12.5, outline: 'none',
            }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="submit" disabled={state === 'sending' || !body.trim()} style={{
            padding: '8px 16px', borderRadius: 2, border: 'none', cursor: 'pointer',
            background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
            fontSize: 12.5, fontWeight: 700,
          }}>
            {state === 'sending' ? 'Posting…' : 'Post'}
          </button>
          {state === 'error' && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{error}</span>}
        </div>
      </form>
    </div>
  )
}
