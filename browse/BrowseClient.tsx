'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { OpportunityCard, type CardExtras } from '@/components/ui/OpportunityCard'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { PulseCard, type PulseDigest } from '@/components/ui/PulseCard'
import { ScrollSubscribePrompt } from '@/components/ui/ScrollSubscribePrompt'
import { interleave } from '@/lib/feed/interleave'
import { REGION_ORDER } from '@/lib/regionDefs'
import type { Facet, Opportunity } from '@/types'

// One Pulse digest card every this many opportunity cards — occasional,
// not competing for attention with the thing people came here for.
const PULSE_EVERY = 9

const AUDIENCE_TABS = [
  { id: 'STUDENT', label: 'Students' },
  { id: 'EARLY_CAREER', label: 'Early Career' },
  { id: 'FOUNDER', label: 'Founders' },
  { id: 'GENERAL', label: 'General' },
]

const DIFFICULTY_TABS = ['Easy', 'Medium', 'Hard']

// Auto-loading stops here and falls back to a manual button — protects a
// long session's tab from holding an unbounded number of cards in the DOM.
const AUTO_LOAD_CAP = 240

const CACHE_PREFIX = 'oppidx_browse_cache:'

interface BrowseCache {
  items: Opportunity[]
  extras: Record<string, CardExtras>
  total: number
  restricted: boolean
  teaser: { title: string; org: string | null; descriptionPreview: string } | null
  page: number
  scrollY: number
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'var(--font-mono)',
      fontSize: 12, fontWeight: 600,
      background: active ? 'var(--btn-bg)' : 'var(--card)',
      color: active ? 'var(--btn-text)' : 'var(--ink)',
      border: `1.5px solid ${active ? 'var(--btn-bg)' : 'var(--line)'}`,
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

export default function BrowseClient() {
  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Deliberately outside the Suspense boundary below. useSearchParams()
          client-side-renders everything up to the closest boundary, so while
          this header lived inside BrowseInner the prerendered HTML for /browse
          contained no <h1> and none of this copy at all — crawlers got a shell,
          and readers got a blank flash before hydration. Nothing here depends
          on the URL, so it prerenders. See "Prerendering" in
          node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md. */}
      <header style={{ padding: '28px 0 24px', borderBottom: '1px solid var(--line)' }}>
        <div className="page-shell">
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 34px)', color: 'var(--ink)' }}>
            Browse the database
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--pin)', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: 10, letterSpacing: '0.01em' }}>
            An elite, hand-curated collection — free to search in full right now.
          </p>
        </div>
      </header>
      <Suspense fallback={null}>
        <BrowseInner />
      </Suspense>
    </div>
  )
}

function BrowseInner() {
  const searchParams = useSearchParams()
  const initialAudience = searchParams.get('audience')
  const initialSearch = searchParams.get('search') ?? ''

  const [audiences, setAudiences] = useState<string[]>(initialAudience ? [initialAudience] : [])
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [search, setSearch] = useState(initialSearch)

  const filterKey = useMemo(
    () => CACHE_PREFIX + JSON.stringify({ audiences, difficulties, regions, countries, search }),
    [audiences, difficulties, regions, countries, search]
  )

  // Read any cached page for these exact filters once, synchronously, so a
  // back-navigation restores content (and, below, scroll position) instead
  // of flashing empty and re-fetching page 1 — a scroll depth of 40 cards
  // shouldn't cost a full re-scroll just because you clicked into one.
  const restoredCache = useRef<BrowseCache | null>(null)
  useState(() => {
    try {
      const raw = sessionStorage.getItem(filterKey)
      restoredCache.current = raw ? (JSON.parse(raw) as BrowseCache) : null
    } catch {
      restoredCache.current = null
    }
  })

  const [items, setItems] = useState<Opportunity[]>(restoredCache.current?.items ?? [])
  const [extras, setExtras] = useState<Record<string, CardExtras>>(restoredCache.current?.extras ?? {})
  const [total, setTotal] = useState(restoredCache.current?.total ?? 0)
  const [restricted, setRestricted] = useState(restoredCache.current?.restricted ?? false)
  const [teaser, setTeaser] = useState(restoredCache.current?.teaser ?? null)
  const [page, setPage] = useState(restoredCache.current?.page ?? 1)
  const [regionFacets, setRegionFacets] = useState<Facet[]>([])
  const [countryFacets, setCountryFacets] = useState<Facet[]>([])
  const [pulseDigests, setPulseDigests] = useState<PulseDigest[]>([])
  const hasValidCache = !!restoredCache.current && restoredCache.current.items.length > 0
  const [loading, setLoading] = useState(!hasValidCache)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestId = useRef(0)
  // Only trust a restored cache enough to skip the initial fetch if it
  // actually has content — an empty snapshot (e.g. saved mid an earlier
  // request that failed) is indistinguishable from "no cache" and should
  // just fall through to a normal fetch instead of getting stuck forever.
  const skipNextFetch = useRef(hasValidCache)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const restoredScroll = useRef(false)
  // Which filterKey the current `items` actually belong to — a restored
  // cache always matches (it was read using this exact filterKey), but a
  // fresh fetch is async: if the search text changes again before the
  // debounced fetch even starts, `items` can briefly be stale relative to
  // `filterKey` while `loading` is still false. Without this, a pagehide
  // in that window persists the old filter's results under the new
  // filter's cache key.
  const itemsFilterKey = useRef(filterKey)

  useEffect(() => {
    fetch('/api/opportunities/facets')
      .then(r => r.json())
      .then(data => {
        setRegionFacets(data.regions ?? [])
        setCountryFacets(data.countries ?? [])
      })
      .catch(() => {})
  }, [])

  // Fetched once, not paginated alongside opportunities — Pulse digests
  // are low-frequency (one a day), no reason to re-fetch on every loadMore.
  useEffect(() => {
    fetch('/api/pulse/recent')
      .then(r => r.json())
      .then(data => setPulseDigests(data.items ?? []))
      .catch(() => {})
  }, [])

  // Restore scroll position exactly once, after the restored cache's items
  // have painted (so the page actually has enough height to scroll to).
  // history.scrollRestoration is set to 'manual' so the browser's own
  // native restore-on-back doesn't race this and win with position 0 — a
  // short timeout rather than requestAnimationFrame, same reasoning as the
  // scroll-trigger switch above.
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    if (restoredScroll.current) return
    const target = restoredCache.current?.scrollY
    if (target) {
      restoredScroll.current = true
      setTimeout(() => window.scrollTo(0, target), 50)
    }
  }, [items])

  function buildParams(pageNum: number) {
    const params = new URLSearchParams({ page: String(pageNum) })
    if (audiences.length) params.set('audience', audiences.join(','))
    if (difficulties.length) params.set('difficulty', difficulties.join(','))
    if (regions.length) params.set('region', regions.join(','))
    if (countries.length) params.set('country', countries.join(','))
    if (search.trim()) params.set('search', search.trim())
    return params
  }

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    const thisRequest = ++requestId.current
    const scheduledForKey = filterKey
    const debounce = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/opportunities?${buildParams(1)}`)
        const data = await res.json()
        if (thisRequest !== requestId.current) return
        setItems(data.items ?? [])
        setExtras(data.extras ?? {})
        setTotal(data.total ?? 0)
        setRestricted(!!data.restricted)
        setTeaser(data.teaser ?? null)
        setPage(1)
        itemsFilterKey.current = scheduledForKey
      } finally {
        if (thisRequest === requestId.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(debounce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audiences, difficulties, regions, countries, search])

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    const keyAtLoadTime = filterKey
    // Same guard the filter effect uses, for the same reason. This appends
    // rather than replaces, so an in-flight page-2 request that lands after
    // the reader has changed a filter used to concatenate the old filter's
    // results onto the new filter's list — a genuinely mixed page — and then
    // label the cache with the stale filterKey, persisting the mixture under
    // the wrong key. Easy to hit, because infinite scroll calls this on its
    // own: scroll far enough to trigger a load, then tap a filter.
    const thisRequest = requestId.current
    try {
      const res = await fetch(`/api/opportunities?${buildParams(nextPage)}`)
      const data = await res.json()
      if (thisRequest !== requestId.current) return
      setItems(prev => [...prev, ...(data.items ?? [])])
      setExtras(prev => ({ ...prev, ...(data.extras ?? {}) }))
      setPage(nextPage)
      itemsFilterKey.current = keyAtLoadTime
    } finally {
      // Always cleared, unlike the `loading` flag above: nothing re-arms this
      // one. A stale response that left it true would early-return every
      // future loadMore() and silently kill infinite scroll for the session.
      // Safe because loadMore() can't overlap itself — it returns immediately
      // while loadingMore is set.
      setLoadingMore(false)
    }
  }

  const emptyState = useMemo(() => !loading && items.length === 0, [loading, items])
  const hasMore = !loading && items.length < total && !restricted
  const autoLoadCapped = items.length >= AUTO_LOAD_CAP
  const lockedCount = restricted ? Math.max(0, total - items.length) : 0
  const anyFilterActive = audiences.length > 0 || difficulties.length > 0 || regions.length > 0 || countries.length > 0 || search.trim().length > 0

  // Pulse only interleaves on the unfiltered board — a digest card mixed
  // into a specific search's results would just be noise unrelated to
  // what someone's actually looking for.
  const feedSlots = useMemo(
    () => interleave(items, anyFilterActive ? [] : pulseDigests, PULSE_EVERY),
    [items, pulseDigests, anyFilterActive]
  )

  // Auto-load on scroll instead of waiting for a click — every extra click
  // is a chance to bounce. Capped, and falls back to the manual button once
  // capped so a long session can't grow the DOM without limit. A plain
  // scroll listener + getBoundingClientRect, not IntersectionObserver —
  // same trigger style as ScrollSubscribePrompt, and avoids depending on
  // rAF-driven observer callbacks some hosts throttle for backgrounded or
  // non-visible tabs.
  useEffect(() => {
    if (!hasMore || autoLoadCapped || loadingMore || loading) return
    function onScroll() {
      const el = sentinelRef.current
      if (!el) return
      if (el.getBoundingClientRect().top < window.innerHeight + 600) loadMore()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, autoLoadCapped, loadingMore, loading, page])

  // Keep a fresh snapshot cached (including scroll position) so clicking
  // into a card and coming back restores exactly where you were.
  useEffect(() => {
    if (loading) return
    // Never cache an empty result — that's indistinguishable from a
    // request that failed partway (e.g. a transient API error) from a
    // genuine "no opportunities" state, and caching it would get a real
    // future load stuck showing nothing. A real empty-filters state is
    // rare enough that just re-fetching it next time costs nothing.
    if (items.length === 0) return
    // And never cache items that don't actually belong to the current
    // filter yet (see itemsFilterKey's declaration) — a stale write here
    // would stick around across sessions, not just one render.
    if (itemsFilterKey.current !== filterKey) return
    function persist() {
      try {
        sessionStorage.setItem(filterKey, JSON.stringify({
          items, extras, total, restricted, teaser, page, scrollY: window.scrollY,
        } satisfies BrowseCache))
      } catch {}
    }
    persist()
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', persist)
    return () => {
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', persist)
    }
  }, [items, extras, total, restricted, teaser, page, loading, filterKey])

  const orderedRegionFacets = useMemo(() => {
    const byValue = new Map(regionFacets.map(f => [f.value, f]))
    const ordered = REGION_ORDER.filter(r => byValue.has(r)).map(r => byValue.get(r)!)
    const rest = regionFacets.filter(f => !REGION_ORDER.includes(f.value))
    return [...ordered, ...rest]
  }, [regionFacets])

  return (
    <>
      <main className="page-shell" style={{ padding: '32px var(--gutter) 60px' }}>
        {/* ── Filter bar ── */}
        <div className="card-box" style={{ padding: '20px 22px', marginBottom: 30 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, org, tag, or eligibility…"
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 2, border: '1.5px solid var(--line)',
              fontFamily: 'var(--font-mono)', fontSize: 13.5,
              background: 'var(--board)', color: 'var(--ink)', outline: 'none', marginBottom: 16,
            }}
          />

          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Category
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {AUDIENCE_TABS.map(t => (
              <FilterChip key={t.id} active={audiences.includes(t.id)} onClick={() => setAudiences(a => toggle(a, t.id))}>
                {t.label}
              </FilterChip>
            ))}
          </div>

          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Difficulty
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {DIFFICULTY_TABS.map(d => (
              <FilterChip key={d} active={difficulties.includes(d)} onClick={() => setDifficulties(a => toggle(a, d))}>
                {d}
              </FilterChip>
            ))}
          </div>

          {orderedRegionFacets.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Region
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {orderedRegionFacets.map(f => (
                  <FilterChip key={f.value} active={regions.includes(f.value)} onClick={() => setRegions(r => toggle(r, f.value))}>
                    {f.value} <span style={{ opacity: 0.6 }}>({f.count})</span>
                  </FilterChip>
                ))}
              </div>
            </>
          )}

          {countryFacets.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
                Country
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value=""
                  onChange={e => { if (e.target.value) setCountries(c => toggle(c, e.target.value)) }}
                  style={{
                    padding: '7px 10px', borderRadius: 2, border: '1.5px solid var(--line)',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                    background: 'var(--card)', color: 'var(--ink)',
                  }}
                >
                  <option value="">Add a country…</option>
                  {countryFacets.filter(f => !countries.includes(f.value)).map(f => (
                    <option key={f.value} value={f.value}>{f.value} ({f.count})</option>
                  ))}
                </select>
                {countries.map(c => (
                  <FilterChip key={c} active onClick={() => setCountries(list => toggle(list, c))}>
                    {c} ✕
                  </FilterChip>
                ))}
              </div>
            </>
          )}

          {anyFilterActive && (
            <div style={{ marginTop: 16 }}>
              <button onClick={() => { setAudiences([]); setDifficulties([]); setRegions([]); setCountries([]); setSearch('') }} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pin)',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
              }}>
                Clear filters
              </button>
            </div>
          )}
        </div>

        <div className="divider" style={{ marginBottom: 26 }}>
          <span>◆ {total.toLocaleString()} opportunities ◆</span>
        </div>

        {emptyState ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            Nothing matches those filters yet — try loosening them.
          </div>
        ) : (
          <>
            <motion.div layout className="card-grid" style={{ ['--card-min' as string]: '260px' }}>
              <AnimatePresence mode="popLayout">
                {feedSlots.map(slot => slot.kind === 'primary'
                  ? <AnimatedCard key={slot.item.id}><OpportunityCard opp={slot.item} extras={extras[slot.item.id]} /></AnimatedCard>
                  : <AnimatedCard key={`pulse-${slot.item.period}`}><PulseCard digest={slot.item} /></AnimatedCard>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Auto-load sentinel — invisible, triggers the next page before
                you'd ever notice a boundary. */}
            {hasMore && !autoLoadCapped && <div ref={sentinelRef} style={{ height: 1 }} />}
            {loadingMore && (
              <div style={{ textAlign: 'center', marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>
                Loading more…
              </div>
            )}

            {hasMore && autoLoadCapped && (
              <div style={{ textAlign: 'center', marginTop: 40 }}>
                <button onClick={loadMore} disabled={loadingMore} style={{
                  padding: '12px 30px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
                  background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
                  fontSize: 13, fontWeight: 700, boxShadow: '3px 3px 0 var(--shadow)',
                }}>
                  {loadingMore ? 'Loading…' : `Load more (${(total - items.length).toLocaleString()} left)`}
                </button>
              </div>
            )}

            {lockedCount > 0 && (
              <div className="card-box" style={{ textAlign: 'center', marginTop: 40, padding: '26px var(--gutter)' }}>
                {teaser && (
                  <div style={{ position: 'relative', marginBottom: 20, textAlign: 'left', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 8, textAlign: 'center' }}>
                      Up next, if you subscribed
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)', marginBottom: 4 }}>
                      {teaser.title}
                    </div>
                    {teaser.org && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>{teaser.org}</div>}
                    <div style={{ position: 'relative' }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{teaser.descriptionPreview}</div>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(to bottom, transparent, var(--card) 90%)',
                        filter: 'blur(1px)', pointerEvents: 'none',
                      }} />
                    </div>
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
                  {lockedCount.toLocaleString()} more matching opportunities are subscriber-only — free search shows the first {items.length}.
                </div>
                <Link href="/pricing" style={{
                  display: 'inline-block', padding: '11px var(--gutter)', borderRadius: 2,
                  background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.02em',
                  boxShadow: '3px 3px 0 var(--shadow)',
                }}>
                  Unlock full search — ₹299/yr
                </Link>
              </div>
            )}
          </>
        )}
      </main>

      <ScrollSubscribePrompt itemsSeen={items.length} />
    </>
  )
}
