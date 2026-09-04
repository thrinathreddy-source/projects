'use client'

import { memo } from 'react'
import Link from 'next/link'
import { SaveButton } from '@/components/ui/SaveButton'
import { SafeImage } from '@/components/ui/SafeImage'
import { GeneratedBanner } from '@/components/ui/GeneratedBanner'
import { EcosystemActions } from '@/components/ui/EcosystemActions'
import { useIsNew } from '@/lib/lastVisit'
import { opportunityPath } from '@/lib/slug'
import { outboundRel } from '@/lib/seo/outboundRel'
import type { Opportunity } from '@/types'

const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  EARLY_CAREER: 'Early Career',
  FOUNDER: 'Founder',
  GENERAL: 'General',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: 'var(--green)',
  Medium: 'var(--pin)',
  Hard: 'var(--danger)',
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/** Clicking "Apply" straight from the card skips the internal detail page
 * entirely (it's a direct external link) — which means ViewTracker (which
 * only lives on /opportunities/[id]) never fires, and a real, genuine
 * "someone chose to apply" moment goes uncounted. Fire the same view
 * increment here too, fire-and-forget, so the count reflects real
 * engagement either way someone reaches the application. */
function trackView(id: string) {
  fetch(`/api/opportunities/${id}/view`, { method: 'POST' }).catch(() => {})
}

export interface CardExtras {
  heroStat: { kind: string; label: string } | null
  discussionCount: number
  resourceCount: number
  gatheringCount: number
  chasingCount: number
  policyReadCount: number
}

const ATTACHMENT_ICON: Record<string, string> = {
  resource: '📚',
  discussion: '💬',
  gathering: '📍',
  chasing: '🫂',
  policy: '📰',
}

/** The attachment strip — resources, discussion, a real gathering, people
 * also chasing this. Every entry here already cleared its own threshold
 * server-side (lib/feedEnrichment.ts); this only ever decides layout, not
 * whether something's real enough to show. A card that clears none of
 * these renders no strip at all, same as a card with no stats gets no
 * stat badge — never a row of zeroes. */
function AttachmentStrip({ href, extras }: { href: string; extras: CardExtras }) {
  const entries: Array<{ kind: string; label: string }> = []
  if (extras.resourceCount > 0) entries.push({ kind: 'resource', label: `${extras.resourceCount} related guide${extras.resourceCount === 1 ? '' : 's'}` })
  if (extras.policyReadCount > 0) entries.push({ kind: 'policy', label: `${extras.policyReadCount} policy read${extras.policyReadCount === 1 ? '' : 's'}` })
  if (extras.discussionCount > 0) entries.push({ kind: 'discussion', label: `${extras.discussionCount} comment${extras.discussionCount === 1 ? '' : 's'}` })
  if (extras.gatheringCount > 0) entries.push({ kind: 'gathering', label: `${extras.gatheringCount} gathering${extras.gatheringCount === 1 ? '' : 's'} for people chasing this` })
  // Deliberately no "see who" — real identities only ever reveal through
  // the weekly match cadence (never a browsable list; that
  // would out who's applying to what), so the card promises exactly what
  // exists: a real count, not a place to look someone up.
  if (extras.chasingCount > 0) entries.push({ kind: 'chasing', label: `${extras.chasingCount} others also chasing this` })

  if (entries.length === 0) return null

  return (
    <Link href={`${href}#related`} className="opp-strip">
      {entries.map(e => (
        <span key={e.kind} className="opp-strip-item">
          <span aria-hidden>{ATTACHMENT_ICON[e.kind]}</span>{e.label}
        </span>
      ))}
    </Link>
  )
}

/**
 * Memoized deliberately: this card sits inside pages that re-render on a
 * timer (the home page polls /api/stats every 15s) or on unrelated state
 * changes elsewhere in the tree. Without memo, every one of those re-runs
 * re-renders every card. `opp`/`extras` are stable object references from
 * parent state in every caller, so the default shallow-prop comparison
 * correctly bails out here without a custom comparator.
 *
 * Styling lives in app/globals.css under `.opp-*` rather than in inline
 * style objects. Two reasons, both real: inline styles cannot express a
 * media query, so the card was pinned to its desktop type scale on a
 * phone; and they were re-serialized into the HTML once per card, which on
 * a 34-card homepage was a large fraction of a 330KB document.
 *
 * The `animated` prop is gone — wrap in <AnimatedCard> instead (see
 * components/ui/AnimatedCard.tsx), which keeps framer-motion out of the
 * bundle of every page that doesn't animate.
 */
export const OpportunityCard = memo(function OpportunityCard({
  opp,
  extras,
}: {
  opp: Opportunity
  extras?: CardExtras
}) {
  const tags = opp.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3)
  const href = opportunityPath(opp)
  // Client-only, and false until the store has read localStorage — the
  // server has no idea when this visitor was last here, so the badge is
  // added after hydration rather than guessed at during SSR.
  const isNew = useIsNew(opp.addedAt)

  return (
    <div className="card-box opp-card">
      <div className={opp.imageUrl ? 'opp-media has-image' : 'opp-media'}>
        {opp.imageUrl ? (
          <SafeImage
            src={opp.imageUrl}
            alt={opp.org ? `${opp.title} at ${opp.org}` : opp.title}
            style={{ borderBottom: '1px solid var(--line)' }}
            sizes="(max-width: 640px) 100vw, 260px"
            fallback={<GeneratedBanner id={opp.id} audience={opp.audience} height={132} />}
          />
        ) : (
          <GeneratedBanner id={opp.id} audience={opp.audience} height={132} />
        )}
        {opp.videoUrl && <span className="opp-video-badge">▶ Video</span>}
      </div>

      <Link href={href} className="opp-body">
        <div className="opp-head">
          <span className="opp-audience">{AUDIENCE_LABEL[opp.audience] ?? opp.audience}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isNew && <span className="opp-new">New</span>}
            {extras?.heroStat && <span className="opp-stat">{extras.heroStat.label}</span>}
          </span>
        </div>

        <h2 className="opp-title">{opp.title}</h2>

        {opp.org && <div className="opp-org">{opp.org}</div>}

        <p className="opp-desc">{opp.description}</p>

        <div className="opp-meta">
          {opp.location && <span>📍 {opp.location}</span>}
          {opp.compType && <span className="is-comp">{opp.compType}</span>}
          <span className="is-difficulty" style={{ color: DIFFICULTY_COLOR[opp.difficulty] ?? 'var(--ink-3)' }}>
            {opp.difficulty}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="opp-tags">
            {tags.map(t => <span key={t} className="opp-tag">#{t}</span>)}
          </div>
        )}
      </Link>

      {/* Raw link, right on the card — no button chrome */}
      <div className="opp-apply">
        <a
          href={opp.url} target="_blank" rel={outboundRel(opp.sourceUrl)}
          onClick={() => trackView(opp.id)}
          className="opp-apply-link"
        >
          Apply → {hostOf(opp.url)}
        </a>
        <SaveButton opportunityId={opp.id} />
      </div>

      {extras && <AttachmentStrip href={href} extras={extras} />}

      <EcosystemActions opp={opp} variant="compact" />
    </div>
  )
})
