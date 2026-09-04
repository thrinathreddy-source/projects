'use client'

import { useState } from 'react'
import { getStoredReferralCode } from '@/lib/clientReferral'

/**
 * Chase — the commitment, not a bookmark.
 *
 * This was "☆ Save", and saving is a dead end: a private pile you have to
 * remember to go back to. The word matters because the action does. Chasing
 * something already puts you in that listing's cohort (lib/chasingCohort.ts
 * counts exactly these rows, which is what "N others also chasing this" has
 * always been reading), and it is now also what arms a notification and what
 * later gets asked "how did it go?" — see lib/push.ts and
 * app/api/saved/outcome/route.ts.
 *
 * The endpoint stays /api/saved and the table stays SavedOpportunity: this is
 * a change of meaning, not of storage, and renaming a live table to match a
 * label would be churn for its own sake.
 */
async function callSaved(method: 'POST' | 'DELETE', opportunityId: string, email?: string) {
  return fetch('/api/saved', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunityId, email, ref: getStoredReferralCode() }),
  })
}

export function SaveButton({ opportunityId, initiallySaved = false }: { opportunityId: string; initiallySaved?: boolean }) {
  const [saved, setSaved] = useState(initiallySaved)
  const [needsEmail, setNeedsEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function toggle(e: React.MouseEvent) {
    // These buttons sit inside a <Link> that wraps the whole card — without
    // both of these a tap navigates instead of chasing.
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (saved) {
        const res = await callSaved('DELETE', opportunityId)
        if (res.ok) setSaved(false)
        else setError('Could not update.')
      } else {
        const res = await callSaved('POST', opportunityId)
        if (res.status === 401) setNeedsEmail(true)
        else if (res.ok) setSaved(true)
        else setError('Could not update.')
      }
    } catch {
      // Offline, or the request never landed. Previously only the 401 branch
      // was handled, so a network failure silently left the button unchanged
      // with no explanation at all.
      setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await callSaved('POST', opportunityId, email.trim())
      if (res.ok) {
        setSaved(true)
        setNeedsEmail(false)
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error === 'needsEmail' ? 'That email looks off.' : 'Could not save that.')
      }
    } catch {
      setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  if (needsEmail) {
    return (
      <form
        onSubmit={submitEmail}
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
      >
        <input
          autoFocus
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="Your email, to keep track of what you're chasing"
          style={{
            padding: '5px 8px', borderRadius: 2, border: '1.5px solid var(--line)',
            background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
            fontSize: 11.5, width: '100%', maxWidth: 150, minWidth: 0, outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="btn-solid"
          style={{ padding: '5px 10px', fontSize: 11.5, boxShadow: 'none' }}
        >
          {busy ? '…' : 'Chase'}
        </button>
        {error && <span style={{ fontSize: 10.5, color: 'var(--danger)', flexBasis: '100%' }}>{error}</span>}
      </form>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={saved ? 'Stop chasing this' : "Chase this — track it, and hear when others like it land"}
      aria-pressed={saved}
      style={{
        padding: '5px 12px', borderRadius: 2, cursor: 'pointer',
        border: `1.5px solid ${saved ? 'var(--pin)' : 'var(--line)'}`,
        background: saved ? 'var(--pin)' : 'var(--card)',
        color: saved ? 'var(--btn-text)' : 'var(--ink)',
        fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700,
        opacity: busy ? 0.6 : 1,
      }}
    >
      {saved ? '◆ Chasing' : '◇ Chase'}
      {error && <span style={{ marginLeft: 6, color: 'var(--danger)' }} title={error}>·</span>}
    </button>
  )
}
