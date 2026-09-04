'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { VALID_CATEGORIES } from '@/lib/resources/validate'
import type { Resource } from '@/types'
import type { UpcomingEvent } from '@/components/ui/EventCard'
import { REFERENCE_REL } from '@/lib/seo/outboundRel'

const HostGatheringModal = dynamic(() => import('@/components/ui/HostGatheringModal').then(m => m.HostGatheringModal), { ssr: false })

const AUDIENCE_TABS = [
  { id: 'STUDENT', label: 'Students' },
  { id: 'EARLY_CAREER', label: 'Early Career' },
  { id: 'FOUNDER', label: 'Founders' },
  { id: 'GENERAL', label: 'General' },
]

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'var(--font-mono)',
      fontSize: 12, fontWeight: 600,
      background: active ? 'var(--btn-bg)' : 'var(--card)',
      color: active ? 'var(--btn-text)' : 'var(--ink)',
      border: `1.5px solid ${active ? 'var(--btn-bg)' : 'var(--line)'}`,
    }}>
      {children}
    </button>
  )
}

function LearnCard({ item }: { item: Resource }) {
  return (
    <Link href={`/resources/${item.id}`} className="card-box" style={{
      padding: 18, textDecoration: 'none', display: 'block', background: 'var(--card)',
      borderColor: 'var(--pin)',
    }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.3 }}>
        {item.title}
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {item.description}
      </p>
    </Link>
  )
}

/** The two literacy categories are the only ones with original, written-for-
 * this-site content (see scripts/seed-resources.ts) rather than outbound
 * links — this band puts them front and center above the generic filter
 * grid instead of letting them get lost among 170+ scraped GitHub repos. */
function LearnSection() {
  const [financial, setFinancial] = useState<Resource[] | null>(null)
  const [spiritual, setSpiritual] = useState<Resource[] | null>(null)

  useEffect(() => {
    // source=native, not just category — the category alone returns
    // whatever the most recent page of (mostly scraped) items is, which
    // isn't guaranteed to include the written-on-OppIDX articles at all
    // once enough scraped items land in the same category.
    fetch(`/api/resources?category=${encodeURIComponent('Financial Literacy')}&source=native`)
      .then(r => r.json())
      .then(data => setFinancial(data.items ?? []))
      .catch(() => setFinancial([]))
    fetch(`/api/resources?category=${encodeURIComponent('Spiritual Literacy')}&source=native`)
      .then(r => r.json())
      .then(data => setSpiritual(data.items ?? []))
      .catch(() => setSpiritual([]))
  }, [])

  if (financial?.length === 0 && spiritual?.length === 0) return null

  return (
    <div style={{ background: 'var(--board)', borderBottom: '1px solid var(--line)', padding: '32px var(--gutter)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="divider" style={{ marginBottom: 6 }}>
          <span>◆ Learn ◆</span>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          Financial and spiritual literacy, written plainly — read straight through, not just linked out.
        </p>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
          Financial Literacy
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
          {(financial ?? []).map(item => <LearnCard key={item.id} item={item} />)}
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 10 }}>
          Spiritual Literacy — Advaita Vedanta
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {(spiritual ?? []).map(item => <LearnCard key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  )
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Real gatherings, folded into Resources rather than living behind their
 * own browse page — a dedicated /events index was often just an empty
 * calendar between gatherings, which read as a dead corner of the site.
 * Individual event pages (/events/[slug]) and hosting/managing one are
 * unchanged — this is only where discovering one lives now. */
function GatheringsSection() {
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null)
  const [hostOpen, setHostOpen] = useState(false)

  useEffect(() => {
    fetch('/api/events/list')
      .then(r => r.json())
      .then(data => setEvents((data.events ?? []).slice(0, 6)))
      .catch(() => setEvents([]))
  }, [])

  return (
    <div style={{ borderBottom: '1px solid var(--line)', padding: '32px var(--gutter)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="divider" style={{ marginBottom: 6 }}>
          <span>◆ Gatherings ◆</span>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>
          Real, upcoming meetups hosted by real people — RSVP, get your QR, walk in.{' '}
          <button onClick={() => setHostOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--pin)', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 700, textDecoration: 'underline' }}>
            Host one →
          </button>
        </p>

        {events === null ? null : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Nothing on the calendar yet.{' '}
            <button onClick={() => setHostOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--pin)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
              Be the first to host →
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {events.map(e => (
              <Link key={e.slug} href={`/events/${e.slug}`} className="card-box" style={{ padding: 16, textDecoration: 'none', display: 'block' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                  📍 {whenLabel(e.event_time)}
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>{e.title}</h2>
                <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>{e.location}{e.rsvpCount > 0 ? ` · ${e.rsvpCount} going` : ''}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {hostOpen && <HostGatheringModal onClose={() => setHostOpen(false)} />}
    </div>
  )
}

function ResourceRow({ item }: { item: Resource }) {
  return (
    <div className="card-box" style={{ marginBottom: 14 }}>
      <Link href={`/resources/${item.id}`} style={{ display: 'block', padding: '18px 20px 12px', textDecoration: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)',
          }}>
            {item.category}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
            {item.audience.replace('_', ' ')}
          </span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', marginBottom: 6 }}>
          {item.title}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          {item.description}
        </p>
      </Link>
      <div style={{ borderTop: '1px solid var(--line)', padding: '10px 20px' }}>
        {item.body ? (
          <Link href={`/resources/${item.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--pin)', textDecoration: 'none' }}>
            Read on OppIDX →
          </Link>
        ) : (
          <a href={item.url} target="_blank" rel={REFERENCE_REL} style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--pin)', textDecoration: 'none',
          }}>
            Open → {hostOf(item.url)}
          </a>
        )}
      </div>
    </div>
  )
}

export default function ResourcesClient() {
  return (
    <Suspense fallback={null}>
      <ResourcesInner />
    </Suspense>
  )
}

function ResourcesInner() {
  const [items, setItems] = useState<Resource[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<string | null>(null)
  const [audiences, setAudiences] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (audiences.length) params.set('audience', audiences.join(','))
    if (search) params.set('search', search)

    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/resources?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
          setItems(data.items ?? [])
          setTotal(data.total ?? 0)
        })
        .catch(() => { setItems([]); setTotal(0) })
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [category, audiences, search])

  function toggleAudience(id: string) {
    setAudiences(list => list.includes(id) ? list.filter(a => a !== id) : [...list, id])
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '34px 0 28px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 var(--gutter)' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 5vw, 40px)',
            lineHeight: 1.15, marginBottom: 10, textTransform: 'uppercase', color: 'var(--ink)',
          }}>
            Resources
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>
            Prep guides, tools, financial-aid explainers, mentorship, communities, and real gatherings — verified, growing every day. <Link href="/resources/submit" style={{ color: 'var(--pin)' }}>Submit one →</Link>
          </p>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources…"
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
              background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
              fontSize: 13, outline: 'none', marginBottom: 16,
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <FilterChip active={category === null} onClick={() => setCategory(null)}>All categories</FilterChip>
            {VALID_CATEGORIES.map(c => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c === category ? null : c)}>{c}</FilterChip>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {AUDIENCE_TABS.map(a => (
              <FilterChip key={a.id} active={audiences.includes(a.id)} onClick={() => toggleAudience(a.id)}>{a.label}</FilterChip>
            ))}
          </div>
        </div>
      </header>

      <GatheringsSection />
      <LearnSection />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px var(--gutter) 80px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} resource${total === 1 ? '' : 's'}`}
        </div>
        {!loading && items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            Nothing matches yet — <Link href="/resources/submit" style={{ color: 'var(--pin)' }}>be the first to submit one →</Link>
          </div>
        ) : (
          items.map(item => <ResourceRow key={item.id} item={item} />)
        )}
      </main>
    </div>
  )
}
