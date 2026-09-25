'use client'

import { useState } from 'react'
import { OUTCOMES, OUTCOME_LABEL, OUTCOME_COLOR, OUTCOME_NOTE_MAX, type Outcome } from '@/lib/outcomes'

export interface ChaseState {
  appliedAt: string | null
  outcome: string | null
  note: string | null
  shareConsent: boolean
}

/**
 * "How did it go?" — the only place an outcome is ever created.
 *
 * Nothing here is inferred. The site can see that someone clicked Apply; it
 * cannot see whether they got in, and guessing would produce exactly the
 * unfalsifiable success rate /manifesto promises not to show. So it asks,
 * and it offers the unglamorous answers first-class: "never heard back" is
 * the most common real outcome of applying to anything, and a tracker that
 * only records wins is a trophy cabinet nobody updates.
 *
 * Sharing is a separate, explicit tick, asked after the outcome and never
 * pre-checked — recording what happened is for the person, publishing it is
 * a different decision.
 */
export function OutcomePicker({
  opportunityId,
  state,
  onChange,
}: {
  opportunityId: string
  state: ChaseState
  onChange: (next: ChaseState) => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(state.note ?? '')
  const [consent, setConsent] = useState(state.shareConsent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const current = state.outcome as Outcome | null

  async function save(outcome: Outcome | null) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/saved/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId,
          outcome,
          note: outcome ? note.slice(0, OUTCOME_NOTE_MAX) : '',
          shareConsent: outcome ? consent : false,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Could not save that.')
        return
      }
      onChange({
        appliedAt: outcome && outcome !== 'withdrew' ? (state.appliedAt ?? new Date().toISOString()) : state.appliedAt,
        outcome,
        note: outcome ? (note.trim() || null) : null,
        shareConsent: outcome ? consent : false,
      })
      setOpen(false)
    } catch {
      setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  if (current && !open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          color: OUTCOME_COLOR[current], border: `1.5px solid ${OUTCOME_COLOR[current]}`,
          borderRadius: 2, padding: '3px 9px',
        }}>
          {OUTCOME_LABEL[current]}
        </span>
        {state.shareConsent && (
          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }} title="Shown anonymously on the proof page">
            shared
          </span>
        )}
        <button
          onClick={() => setOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', textDecoration: 'underline' }}
        >
          change
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-outline"
        style={{ padding: '5px 12px', fontSize: 11.5 }}
      >
        How did it go?
      </button>
    )
  }

  return (
    <div style={{
      border: '1.5px solid var(--line)', borderRadius: 2, padding: '12px 13px',
      background: 'var(--board)', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OUTCOMES.map(o => (
          <button
            key={o}
            onClick={() => save(o)}
            disabled={busy}
            style={{
              padding: '6px 11px', borderRadius: 2, cursor: 'pointer',
              border: `1.5px solid ${current === o ? OUTCOME_COLOR[o] : 'var(--line)'}`,
              background: current === o ? OUTCOME_COLOR[o] : 'var(--card)',
              color: current === o ? 'var(--btn-text)' : 'var(--ink)',
              fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700,
            }}
          >
            {OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={e => setNote(e.target.value.slice(0, OUTCOME_NOTE_MAX))}
        placeholder="Anything worth remembering? (optional)"
        rows={2}
        aria-label="A note about how it went, optional"
        style={{
          border: '1.5px solid var(--line)', borderRadius: 2, padding: '7px 9px',
          background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
          fontSize: 12, outline: 'none', resize: 'vertical', width: '100%',
        }}
      />

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--ink-2)', cursor: 'pointer', lineHeight: 1.45 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Let others see this, without my name — it&apos;s the only proof this board actually works.</span>
      </label>

      {error && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{error}</span>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(false)} disabled={busy} className="btn-outline" style={{ padding: '5px 12px', fontSize: 11.5 }}>
          Cancel
        </button>
        {current && (
          <button onClick={() => save(null)} disabled={busy} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px',
            fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', textDecoration: 'underline',
          }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
