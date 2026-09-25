'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { NotifyButton } from '@/components/ui/NotifyButton'
import { OutcomePicker, type ChaseState } from '@/components/ui/OutcomePicker'
import { opportunityPath } from '@/lib/slug'
import type { Opportunity } from '@/types'

async function shareChaseCard(items: Opportunity[], appliedCount: number) {
  const params = new URLSearchParams()
  items.slice(0, 3).forEach(o => params.append('title', o.title))
  params.set('total', String(items.length))
  if (appliedCount > 0) params.set('applied', String(appliedCount))

  const url = '/api/saved/card?' + params.toString()
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const file = new File([blob], 'oppidx-chasing.png', { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text: "Here's what I'm chasing — oppidx.com" })
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = 'oppidx-chasing.png'
    a.click()
    URL.revokeObjectURL(objectUrl)
  } catch {
    // user can still screenshot the page as a fallback
  }
}

/** One row of the tracker. A card grid answers "what did I save"; a tracker
 * has to answer "where does each of these stand", which is a list. */
function ChaseRow({
  opp,
  state,
  onChange,
}: {
  opp: Opportunity
  state: ChaseState
  onChange: (next: ChaseState) => void
}) {
  return (
    <div className="card-box" style={{ padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <Link href={opportunityPath(opp)} style={{ textDecoration: 'none' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, color: 'var(--ink)', lineHeight: 1.35, marginBottom: 3 }}>
              {opp.title}
            </h2>
          </Link>
          {opp.org && <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{opp.org}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
            color: state.appliedAt ? 'var(--pin)' : 'var(--ink-3)',
          }}>
            {state.appliedAt ? '◆ Applied' : '◇ Not applied yet'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <a
          href={opp.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline"
          style={{ padding: '5px 12px', fontSize: 11.5 }}
        >
          Apply →
        </a>
        {/* Asking "how did it go?" before they've applied is noise, so the
            picker only appears once there's something to report on. */}
        {state.appliedAt || state.outcome ? (
          <OutcomePicker opportunityId={opp.id} state={state} onChange={onChange} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            We&apos;ll ask how it went once you&apos;ve applied.
          </span>
        )}
      </div>

      {state.note && (
        <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.55, borderLeft: '2px solid var(--line)', paddingLeft: 10 }}>
          {state.note}
        </div>
      )}
    </div>
  )
}

export default function SavedClient() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [chases, setChases] = useState<Record<string, ChaseState>>({})
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    fetch('/api/saved')
      .then(r => r.json())
      .then(data => {
        setItems(data.items ?? [])
        setChases(data.chases ?? {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Derived from `chases` rather than held as its own state: the previous
  // version stored appliedCount separately, which meant recording an outcome
  // updated the row but left the headline count stale until a reload.
  const { appliedCount, openCount, settledCount } = useMemo(() => {
    const all = Object.values(chases)
    return {
      appliedCount: all.filter(c => c.appliedAt).length,
      openCount: all.filter(c => !c.outcome).length,
      settledCount: all.filter(c => c.outcome).length,
    }
  }, [chases])

  // Open chases first — the tracker's job is to surface what still needs
  // doing, not to preserve save order once things start settling.
  const ordered = useMemo(() => {
    return [...items].sort((a, b) => {
      const aSettled = chases[a.id]?.outcome ? 1 : 0
      const bSettled = chases[b.id]?.outcome ? 1 : 0
      return aSettled - bSettled
    })
  }, [items, chases])

  return (
    <div>
      <header style={{ padding: '28px 0 24px', borderBottom: '1px solid var(--line)' }}>
        <div className="page-shell">
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pin)', fontFamily: 'var(--font-mono)' }}>
            ◆ Chaser tools ◆
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 34px)', color: 'var(--ink)', marginTop: 8 }}>
            What you&apos;re chasing
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginTop: 10 }}>
            Hit ◇ Chase on any listing to track it here. Record what happened — that&apos;s how anyone
            finds out whether this board actually works.
          </p>

          {!loading && items.length > 0 && (
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
              <span><strong style={{ fontSize: 15, color: 'var(--pin)' }}>{items.length}</strong> chasing</span>
              <span><strong style={{ fontSize: 15, color: 'var(--pin)' }}>{appliedCount}</strong> applied</span>
              <span><strong style={{ fontSize: 15, color: 'var(--pin)' }}>{settledCount}</strong> settled</span>
              <span><strong style={{ fontSize: 15, color: 'var(--pin)' }}>{openCount}</strong> still open</span>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <NotifyButton />
            {items.length > 0 && (
              <button
                onClick={async () => { setSharing(true); await shareChaseCard(items, appliedCount); setSharing(false) }}
                disabled={sharing}
                className="btn-solid"
                style={{ padding: '10px 18px', fontSize: 12.5, opacity: sharing ? 0.6 : 1 }}
              >
                {sharing ? 'Building card…' : "✦ Share what I'm chasing"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="page-shell" style={{ padding: '32px var(--gutter) 60px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Nothing yet. <Link href="/browse" style={{ color: 'var(--pin)' }}>Find something worth chasing →</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ordered.map(opp => (
              <ChaseRow
                key={opp.id}
                opp={opp}
                state={chases[opp.id] ?? { appliedAt: null, outcome: null, note: null, shareConsent: false }}
                onChange={next => setChases(prev => ({ ...prev, [opp.id]: next }))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
