"use client";

/**
 * Visual, card-based rendering for one Pulse headline — replaces the old
 * plain-text list row. Grounded in the actual research on this: visuals
 * are processed ~10x faster than text and retain roughly 65% vs 10% for
 * text alone, so headline-first, icon-led cards in a scannable grid beat
 * a dense paragraph list for an audience that's mostly skimming. Used by
 * both the live /pulse page and the shareable digest pages, so
 * the two never visually drift apart.
 *
 * headlineId is optional and only ever passed by the live /pulse
 * page — digest snapshot pages (PolicyDigest) don't have a stable id to
 * hang a discussion thread off, since they're a point-in-time copy of
 * data that later rolls out of Supabase's 14-day pulse_headlines window.
 * No headlineId, no discussion toggle; same card otherwise.
 */
import { useState } from "react";
import { PulseComments } from "./PulseComments";

export interface PulseCardItem {
  sym: string
  category: string
  title: string
  source: string
  timeLabel?: string
  url: string
  headlineId?: string
}

export function PulseHeadlineGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
      {children}
    </div>
  )
}

export function PulseHeadlineCard({ sym, category, title, source, timeLabel, url, headlineId }: PulseCardItem) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{
      padding: '16px 16px 12px', height: '100%', display: 'flex', flexDirection: 'column',
      border: '1.5px solid var(--border)',
    }}>
      <a
        href={url} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 22, color: 'var(--saffron)', lineHeight: 1, flexShrink: 0 }} aria-hidden="true">{sym}</span>
          <span className="font-typewriter" style={{
            fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: 'var(--maroon)', background: 'var(--bg-dark)', padding: '3px 9px', borderRadius: 999,
          }}>
            {category}
          </span>
        </div>
        <p className="font-typewriter" style={{ fontSize: 14.5, lineHeight: 1.4, color: 'var(--ink)', margin: '0 0 12px', flex: 1 }}>
          {title}
        </p>
      </a>

      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: 'var(--ink-muted)',
        borderTop: '1px solid var(--border)', paddingTop: 8,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source}</span>
        <span style={{ flexShrink: 0 }}>{timeLabel}</span>
      </div>

      {headlineId && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="font-typewriter"
            style={{
              marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 10.5, color: 'var(--saffron)', textAlign: 'left',
            }}
          >
            {open ? '▾ Hide discussion' : '▸ View discussion'}
          </button>
          {open && <PulseComments headlineId={headlineId} />}
        </>
      )}
    </div>
  )
}
