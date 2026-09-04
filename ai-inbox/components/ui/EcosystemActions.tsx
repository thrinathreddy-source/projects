'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { relatedResourceCategories } from '@/lib/opportunityResourceMap'

// Loaded on demand, not bundled into every page that renders a card — the
// match modal in particular pulls in the Match feature's Supabase client,
// which has no business being in the core OppIDX bundle for the vast
// majority of visitors who never open it.
const FindYourPersonModal = dynamic(() => import('@/components/ui/FindYourPersonModal').then(m => m.FindYourPersonModal), { ssr: false })
const HostGatheringModal = dynamic(() => import('@/components/ui/HostGatheringModal').then(m => m.HostGatheringModal), { ssr: false })
const SubmitResourceModal = dynamic(() => import('@/components/ui/SubmitResourceModal').then(m => m.SubmitResourceModal), { ssr: false })
const PolicyDigestModal = dynamic(() => import('@/components/ui/PolicyDigestModal').then(m => m.PolicyDigestModal), { ssr: false })

type ModalKind = 'match' | 'event' | 'resource' | 'policy'

interface OppRef {
  id: string
  title: string
  tags: string
  audience: string
}

// A `title` attribute (native hover tooltip) is invisible on touch devices,
// which is most of this traffic — a bare icon row asks a first-time mobile
// visitor to tap blind to find out what each one does. A tiny caption under
// each icon costs a little height but makes every action self-explanatory
// with no interaction required, on any device.
const iconCaptionStyle: React.CSSProperties = {
  display: 'block', fontSize: 8.5, fontFamily: 'var(--font-mono)', fontWeight: 700,
  letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

function IconButton({ icon, caption, label, onClick }: { icon: string; caption: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      style={{
        flex: 1, padding: '7px 2px 6px', border: 'none', background: 'none', cursor: 'pointer',
        fontSize: 15, borderRadius: 2, lineHeight: 1, textAlign: 'center',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(43,38,32,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {icon}
      <span style={iconCaptionStyle}>{caption}</span>
    </button>
  )
}

function PromptRow({ text, cta, onClick, accent }: { text: string; cta: string; onClick: () => void; accent?: boolean }) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, flexWrap: 'wrap',
      border: accent ? '1px solid var(--line)' : '1px dashed var(--line)',
      background: accent ? 'var(--board)' : 'transparent',
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{text}</span>
      <button type="button" onClick={onClick} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 12.5, fontWeight: 700, color: 'var(--pin)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
      }}>{cta} →</button>
    </div>
  )
}

/**
 * The one-click bridge into the rest of the ecosystem — hosting a gathering,
 * adding a guide, and reading policy — from wherever an opportunity is
 * already being looked at. The compact card row deliberately leaves Match
 * out (it's a heavier, more personal action than the others; it only
 * appears in the `full` variant on the opportunity's own detail page, as
 * "Find your person"). Match has no standalone "come explore it"
 * destination on purpose beyond that: matching runs automatically in the
 * background (the Friday cron + chasingCohort's "N others chasing this").
 * Every action opens a real popup backed by the exact same endpoints its
 * full-page counterpart uses — nothing here is a shortcut that produces
 * fake or incomplete data, just a shorter path to a real one.
 */
export function EcosystemActions({ opp, variant = 'compact', hasResources = false, hasGatherings = false }: {
  opp: OppRef
  variant?: 'compact' | 'full'
  hasResources?: boolean
  hasGatherings?: boolean
}) {
  const [open, setOpen] = useState<ModalKind | null>(null)
  const resourceCategory = relatedResourceCategories(opp)[0] ?? 'Templates & Guides'

  return (
    <>
      {variant === 'compact' ? (
        <div style={{ display: 'flex', borderTop: '1px solid var(--line)' }}>
          <IconButton icon="📍" caption="Event" label="Host a gathering" onClick={() => setOpen('event')} />
          <IconButton icon="📚" caption="Guide" label="Add a guide" onClick={() => setOpen('resource')} />
          <IconButton icon="📰" caption="Policy" label="Policy reads" onClick={() => setOpen('policy')} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <PromptRow text="Chasing this too?" cta="Find your person" onClick={() => setOpen('match')} accent />
          {!hasResources && <PromptRow text="No guides linked to this one yet." cta="Wanna add a guide?" onClick={() => setOpen('resource')} />}
          {!hasGatherings && <PromptRow text="No gathering for people chasing this — yet." cta="Wanna create one?" onClick={() => setOpen('event')} />}
        </div>
      )}

      {open === 'match' && <FindYourPersonModal opportunityTitle={opp.title} onClose={() => setOpen(null)} />}
      {open === 'event' && <HostGatheringModal opportunityTitle={opp.title} onClose={() => setOpen(null)} />}
      {open === 'resource' && <SubmitResourceModal opportunityTitle={opp.title} defaultCategory={resourceCategory} defaultAudience={opp.audience} onClose={() => setOpen(null)} />}
      {open === 'policy' && <PolicyDigestModal opportunityId={opp.id} opportunityTitle={opp.title} onClose={() => setOpen(null)} />}
    </>
  )
}
