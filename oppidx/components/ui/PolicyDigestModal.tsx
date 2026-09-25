'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Modal, ModalHeader } from '@/components/ui/Modal'

interface PolicyRead {
  title: string
  url: string
  category: string
  source: string
}

/** A quick-read preview instead of a full-page navigation — same real,
 * matched headlines (lib/opportunityPulseMap.ts) the detail page already
 * lists inline, fetched on demand so a card in the feed never has to
 * carry every opportunity's policy reads down to the client up front. */
export function PolicyDigestModal({ opportunityId, opportunityTitle, onClose }: {
  opportunityId: string
  opportunityTitle: string
  onClose: () => void
}) {
  const [items, setItems] = useState<PolicyRead[] | null>(null)
  // The newest digest that actually exists, not today's date. The digest is
  // written by a cron at 15:30 UTC, so linking to today unconditionally sent
  // every visitor before that to a 404 — most of each day, and all day if the
  // cron ever failed. null until known, which also hides the link entirely
  // when there are no digests.
  const [latestDigest, setLatestDigest] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/policy-reads`)
      .then(r => r.json())
      .then(data => setItems(data.items ?? []))
      .catch(() => setItems([]))
  }, [opportunityId])

  useEffect(() => {
    fetch('/api/pulse/digests')
      .then(r => r.json())
      .then(data => setLatestDigest(data.items?.[0]?.period ?? null))
      .catch(() => setLatestDigest(null))
  }, [])

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Policy reads" subtitle={`Related to "${opportunityTitle}"`} onClose={onClose} />
      {items === null ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Nothing genuinely relevant right now.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(p => (
            <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', padding: '12px 14px', borderRadius: 2, border: '1px solid var(--line)',
              background: 'var(--board)', textDecoration: 'none',
            }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.4, marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{p.source} · {p.category}</div>
            </a>
          ))}
        </div>
      )}
      {latestDigest && (
        <Link href={`/pulse/digest/${latestDigest}`} style={{
          display: 'block', marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)',
          fontSize: 12.5, fontWeight: 700, color: 'var(--pin)', textDecoration: 'none', textAlign: 'center',
        }}>
          📰 Read the latest full policy digest →
        </Link>
      )}
    </Modal>
  )
}
