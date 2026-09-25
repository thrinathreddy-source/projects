'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { OpportunityCard, type CardExtras } from '@/components/ui/OpportunityCard'
import { PulseCard, type PulseDigest } from '@/components/ui/PulseCard'
import { EventCard, type UpcomingEvent } from '@/components/ui/EventCard'
import { SkeletonCards } from '@/components/ui/SkeletonCard'
import { ScrollSubscribePrompt } from '@/components/ui/ScrollSubscribePrompt'
import { interleaveMulti } from '@/lib/feed/interleave'
import type { Opportunity } from '@/types'

// Same occasional cadence as /browse.
const PULSE_EVERY = 9
const EVENTS_EVERY = 15

/** One API page, so the skeleton row is the width of what's actually coming. */
const PAGE_SIZE = 24

/**
 * The full board below the day's picks.
 *
 * Page 1 arrives already rendered from the server (see lib/homeFeed.ts) —
 * this component's only job is to load pages 2, 3, … on request, which
 * genuinely needs the browser. It deliberately does not re-fetch page 1:
 * doing so was what made the old homepage paint empty and then pop in.
 *
 * Paging is a button, not a scroll sentinel. Auto-loading on scroll meant
 * the footer could never be reached — every attempt to get to it appended
 * another twenty-four cards and pushed it back down the page, so the site
 * links, the policy pages and the newsletter box at the bottom were in
 * practice unreachable from the homepage. A button also hands the reader
 * the decision about when to commit to another screenful.
 */
export default function HomeBoard({
  initialItems,
  initialExtras,
  boardTotal,
  featuredCount,
  pulseDigests,
  events,
}: {
  initialItems: Opportunity[]
  initialExtras: Record<string, CardExtras>
  boardTotal: number
  featuredCount: number
  pulseDigests: PulseDigest[]
  events: UpcomingEvent[]
}) {
  const [items, setItems] = useState<Opportunity[]>(initialItems)
  const [extras, setExtras] = useState<Record<string, CardExtras>>(initialExtras)
  const [page, setPage] = useState(1)
  const [restricted, setRestricted] = useState(false)
  const [teaser, setTeaser] = useState<{ title: string; org: string | null; descriptionPreview: string } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)

  // Seeded from the server-rendered page so a listing already shown above
  // (in the picks) or below (in page 1) never renders twice.
  const shownIds = useRef<Set<string>>(new Set(initialItems.map(o => o.id)))
  const loadingRef = useRef(false)

  const remaining = Math.max(boardTotal - featuredCount - items.length, 0)
  const hasMore = remaining > 0 && !restricted

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/opportunities?page=${page + 1}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const fresh = (data.items ?? []).filter((o: Opportunity) => !shownIds.current.has(o.id))
      for (const o of fresh) shownIds.current.add(o.id)
      setItems(prev => [...prev, ...fresh])
      setExtras(prev => ({ ...prev, ...(data.extras ?? {}) }))
      setRestricted(!!data.restricted)
      setTeaser(data.teaser ?? null)
      setPage(p => p + 1)
    } catch {
      // With a button rather than a scroll sentinel there's no second
      // chance to retry silently, so a failure has to be visible and
      // actionable instead of just stopping.
      setFailed(true)
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [page])

  const slots = interleaveMulti(items, [
    { kind: 'pulse', items: pulseDigests, every: PULSE_EVERY },
    { kind: 'event', items: events, every: EVENTS_EVERY },
  ])

  return (
    <>
      <div className="card-grid" style={{ ['--card-min' as string]: '260px', marginBottom: 20 }}>
        {slots.map(slot => {
          if (slot.kind === 'primary') {
            const opp = slot.item as Opportunity
            return <OpportunityCard key={opp.id} opp={opp} extras={extras[opp.id]} />
          }
          if (slot.kind === 'event') {
            const event = slot.item as UpcomingEvent
            return <EventCard key={`event-${event.slug}`} event={event} />
          }
          const digest = slot.item as PulseDigest
          return <PulseCard key={`pulse-${digest.period}`} digest={digest} />
        })}

        {/* Inside the same grid so the placeholders land in the real
            columns, continuing the row rather than starting a new block. */}
        {loadingMore && <SkeletonCards count={Math.min(PAGE_SIZE, remaining || PAGE_SIZE)} />}
      </div>

      {restricted && teaser && (
        <div className="card-box" style={{ padding: '24px 22px', textAlign: 'center', marginTop: 10, marginBottom: 36 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', marginBottom: 8 }}>{teaser.title}</div>
          {teaser.org && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>{teaser.org}</div>}
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 16 }}>{teaser.descriptionPreview}…</p>
          <Link href="/pricing" className="btn-solid" style={{ padding: '10px 20px', fontSize: 13 }}>
            See the rest of the board →
          </Link>
        </div>
      )}

      {hasMore && (
        <div className="board-more">
          <button onClick={loadMore} disabled={loadingMore} className="btn-outline board-more-btn">
            {loadingMore ? 'Loading…' : 'Load more opportunities →'}
          </button>
          <div className="board-more-count">
            Showing {items.length.toLocaleString()} of {(boardTotal - featuredCount).toLocaleString()}
          </div>
          {failed && (
            <div className="board-more-error" role="alert">
              That didn&apos;t load — check your connection and try again.
            </div>
          )}
        </div>
      )}

      {!restricted && !hasMore && items.length > 0 && (
        <div className="board-end">
          That&apos;s every real opportunity on the board right now — check back, it&apos;s always growing.
        </div>
      )}

      {/* The hero's newsletter box is hidden on phones (it was one more
          thing between someone and the board); this asks later instead,
          once they've scrolled far enough to have an opinion. On desktop
          both exist, and the one-shot dismiss key keeps it from nagging. */}
      <ScrollSubscribePrompt itemsSeen={items.length} />
    </>
  )
}
