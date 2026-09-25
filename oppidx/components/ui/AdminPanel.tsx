'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wordmark } from '@/components/ui/Wordmark'
import { VALID_CATEGORIES } from '@/lib/resources/validate'
import type { Opportunity, Resource, ResourceScrapeRun, ScrapeRun, Subscriber, SponsoredSlot } from '@/types'

const AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

const EMPTY_FORM = {
  title: '', description: '', url: '', org: '', audience: 'STUDENT',
  eligibility: '', prepResources: '', difficulty: 'Medium',
  tags: '', location: '', compType: '', verified: false, featured: false,
  source: 'user-provided', sourceUrl: '',
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 2, border: '1.5px solid var(--line)',
    fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--card)', color: 'var(--ink)',
    outline: 'none', marginBottom: 12,
  }
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: typeof EMPTY_FORM[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add.')
      setForm(EMPTY_FORM)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 480 }}>
      <input style={inputStyle()} placeholder="Title" required value={form.title} onChange={e => set('title', e.target.value)} />
      <textarea style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }} placeholder="Description" required value={form.description} onChange={e => set('description', e.target.value)} />
      <input style={inputStyle()} placeholder="Application URL (https://…)" required value={form.url} onChange={e => set('url', e.target.value)} />
      <input style={inputStyle()} placeholder="Org / company / university" value={form.org} onChange={e => set('org', e.target.value)} />
      <select style={inputStyle()} value={form.audience} onChange={e => set('audience', e.target.value)}>
        {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <textarea style={{ ...inputStyle(), minHeight: 60, resize: 'vertical' }} placeholder="Eligibility (who can actually apply)" required value={form.eligibility} onChange={e => set('eligibility', e.target.value)} />
      <textarea style={{ ...inputStyle(), minHeight: 60, resize: 'vertical' }} placeholder="Suggested prep resources" value={form.prepResources} onChange={e => set('prepResources', e.target.value)} />
      <select style={inputStyle()} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
        {DIFFICULTIES.map(d => <option key={d} value={d}>{d} difficulty</option>)}
      </select>
      <input style={inputStyle()} placeholder="Tags, comma-separated (remote,paid,ai)" value={form.tags} onChange={e => set('tags', e.target.value)} />
      <input style={inputStyle()} placeholder="Location" value={form.location} onChange={e => set('location', e.target.value)} />
      <input style={inputStyle()} placeholder="Compensation (Paid / Unpaid / Stipend)" value={form.compType} onChange={e => set('compType', e.target.value)} />
      <input style={inputStyle()} placeholder="Source URL (where you verified this)" value={form.sourceUrl} onChange={e => set('sourceUrl', e.target.value)} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
        <input type="checkbox" checked={form.verified} onChange={e => set('verified', e.target.checked)} />
        Mark verified immediately
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
        <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} />
        Feature on homepage (&quot;best of the week&quot;)
      </label>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <button type="submit" disabled={saving} style={{
        padding: '10px 22px', borderRadius: 2, border: 'none', cursor: 'pointer',
        background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.02em',
        boxShadow: '3px 3px 0 var(--shadow)',
      }}>
        {saving ? 'Adding…' : 'Add opportunity'}
      </button>
    </form>
  )
}

function Row({ opp, onChanged }: { opp: Opportunity; onChanged: () => void }) {
  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    onChanged()
  }

  return (
    <div className="card-box" style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '12px 16px', marginBottom: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {opp.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {opp.audience} · {opp.verified ? 'verified' : 'needs review'} · {opp.featured ? 'featured' : ''} {opp.viewCount} views
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {!opp.verified && (
          <button onClick={() => patch({ verified: true })} style={btnStyle('var(--green)')}>Verify</button>
        )}
        {opp.verified && (
          <button onClick={() => patch({ featured: !opp.featured })} style={btnStyle('var(--pin)')}>
            {opp.featured ? 'Unfeature' : 'Feature'}
          </button>
        )}
        <button onClick={() => patch({ delete: true })} style={btnStyle('var(--danger)')}>Delete</button>
      </div>
    </div>
  )
}

const EMPTY_RESOURCE_FORM = {
  title: '', description: '', url: '', category: VALID_CATEGORIES[0], audience: 'GENERAL', verified: true,
}

function ResourceAddForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState(EMPTY_RESOURCE_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set<K extends keyof typeof EMPTY_RESOURCE_FORM>(key: K, value: typeof EMPTY_RESOURCE_FORM[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'admin' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add.')
      setForm(EMPTY_RESOURCE_FORM)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 480 }}>
      <input style={inputStyle()} placeholder="Title" required value={form.title} onChange={e => set('title', e.target.value)} />
      <textarea style={{ ...inputStyle(), minHeight: 90, resize: 'vertical' }} placeholder="Description" value={form.description} onChange={e => set('description', e.target.value)} />
      <input style={inputStyle()} placeholder="URL (https://…)" required value={form.url} onChange={e => set('url', e.target.value)} />
      <select style={inputStyle()} value={form.category} onChange={e => set('category', e.target.value)}>
        {VALID_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select style={inputStyle()} value={form.audience} onChange={e => set('audience', e.target.value)}>
        {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
        <input type="checkbox" checked={form.verified} onChange={e => set('verified', e.target.checked)} />
        Mark verified immediately
      </label>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <button type="submit" disabled={saving} style={{
        padding: '10px 22px', borderRadius: 2, border: 'none', cursor: 'pointer',
        background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.02em',
        boxShadow: '3px 3px 0 var(--shadow)',
      }}>
        {saving ? 'Adding…' : 'Add resource'}
      </button>
    </form>
  )
}

function ResourceRow({ item, onChanged }: { item: Resource; onChanged: () => void }) {
  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/resources/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    onChanged()
  }

  return (
    <div className="card-box" style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '12px 16px', marginBottom: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {item.category} · {item.audience} · {item.verified ? 'verified' : 'needs review'} · {item.source}{item.submitterEmail ? ` · ${item.submitterEmail}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {!item.verified && (
          <button onClick={() => patch({ verified: true })} style={btnStyle('var(--green)')}>Verify</button>
        )}
        <button onClick={() => patch({ delete: true })} style={btnStyle('var(--danger)')}>Delete</button>
      </div>
    </div>
  )
}

function ResourceScraperPanel() {
  const [runs, setRuns] = useState<ResourceScrapeRun[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const res = await fetch('/api/resources/scrape')
    const data = await res.json()
    setRuns(data.runs ?? [])
  }

  useEffect(() => { refresh() }, [])

  async function runNow() {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/resources/scrape', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Run failed.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
          Runs every 6 hours via GitHub Actions — GitHub awesome-lists + curated subreddits, each candidate gated by the same live-link + duplicate check as a public submission.
        </div>
        <button onClick={runNow} disabled={running} style={{
          padding: '8px 16px', borderRadius: 2, border: 'none', cursor: 'pointer',
          background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
          fontWeight: 700, fontSize: 12.5, flexShrink: 0,
        }}>
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {runs.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No runs yet.</div>
      ) : (
        runs.map(run => {
          let details: Record<string, { fetched: number; added: number; error: string | null }> = {}
          try { details = JSON.parse(run.details) } catch { /* ignore malformed row */ }
          return (
            <div key={run.id} className="card-box" style={{ padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                {new Date(run.startedAt).toLocaleString()} — added {run.added}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {Object.entries(details).map(([name, s]) => (
                  <div key={name}>
                    {name}: {s.fetched} fetched, {s.added} added{s.error ? ` — error: ${s.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function ResourcesPanel() {
  const [items, setItems] = useState<Resource[]>([])
  const [subTab, setSubTab] = useState<'queue' | 'all' | 'add' | 'scraper'>('queue')

  // useCallback so the effect below can depend on the function itself rather
  // than re-listing what it closes over. Plain function declarations are new
  // on every render, so naming one in a dependency array re-runs the fetch on
  // every render; this identity only changes when subTab does.
  const refresh = useCallback(async () => {
    if (subTab === 'add' || subTab === 'scraper') return
    const status = subTab === 'queue' ? 'unverified' : 'all'
    const res = await fetch(`/api/resources?status=${status}`)
    const data = await res.json()
    setItems(data.items ?? [])
  }, [subTab])

  // refresh() reaches its first setState only after `await fetch(...)`, so
  // nothing is set synchronously in the effect body and no extra render pass
  // happens before paint. The rule can't see through the async call.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['queue', 'add', 'all', 'scraper'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            padding: '7px 14px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
            background: subTab === t ? 'var(--btn-bg)' : 'var(--card)',
            color: subTab === t ? 'var(--btn-text)' : 'var(--ink)',
          }}>
            {t === 'queue' ? 'Needs review' : t === 'add' ? 'Add new' : t === 'all' ? 'All resources' : 'Scraper'}
          </button>
        ))}
      </div>
      {subTab === 'add' ? (
        <ResourceAddForm onAdded={refresh} />
      ) : subTab === 'scraper' ? (
        <ResourceScraperPanel />
      ) : items.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Nothing here.</div>
      ) : (
        items.map(item => <ResourceRow key={item.id} item={item} onChanged={refresh} />)
      )}
    </div>
  )
}

interface Breakdown { label: string; count: number }
interface DayCount { date: string; count: number }
interface StatsData {
  opportunities: { total: number; verified: number; unverified: number; byAudience: Breakdown[]; bySource: Breakdown[]; last30Days: DayCount[] }
  resources: { total: number; verified: number; unverified: number; byCategory: Breakdown[]; bySource: Breakdown[]; last30Days: DayCount[] }
  subscribers: { total: number; paid: number; free: number; last30Days: DayCount[] }
  submissions: { byStatus: Breakdown[] }
  scraperRuns: { opportunities: { startedAt: string; added: number }[]; resources: { startedAt: string; added: number }[] }
  digests: { period: string; periodType: string; itemCount: number; createdAt: string }[]
  retention: {
    totalVisitors: number; returningVisitors: number; returnRatePct: number; last30Days: DayCount[]
    weeklyTrend: { weekOf: string; returnRatePct: number; totalVisitors: number }[]
    cohorts: { cohortDate: string; cohortSize: number; day1Pct: number | null; day7Pct: number | null; day30Pct: number | null }[]
  }
  conversion: { totalSaved: number; appliedFromSaved: number; conversionRatePct: number }
  email: { last30DaysByStatus: Breakdown[]; suppressed: number }
  boardGrowth: {
    days: number
    series: { date: string; totalOpportunities: number; newLast24h: number }[]
    startTotal: number
    endTotal: number
    avgNewPerDay: number
    bestDay: { date: string; added: number } | null
  }
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: 'var(--board)', border: '1px solid var(--line)', borderRadius: 2, padding: '14px 16px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--ink)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
    </div>
  )
}

function BreakdownBars({ title, data }: { title: string; data: Breakdown[] }) {
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        {title}
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>No data.</div>
      ) : (
        [...data].sort((a, b) => b.count - a.count).map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 130, fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label || '(none)'}
            </div>
            <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--line)', height: 14, position: 'relative' }}>
              <div style={{ width: `${(d.count / max) * 100}%`, background: 'var(--pin)', height: '100%' }} />
            </div>
            <div style={{ width: 42, fontSize: 11.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)', textAlign: 'right', flexShrink: 0 }}>
              {d.count}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function GrowthSparkline({ title, data }: { title: string; data: DayCount[] }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const total = data.reduce((sum, d) => sum + d.count, 0)
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        {title} — {total} in last 30 days
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
        {data.map(d => (
          <div key={d.date} title={`${d.date}: ${d.count}`} style={{
            flex: 1, height: `${Math.max(2, (d.count / max) * 100)}%`,
            background: d.count > 0 ? 'var(--pin)' : 'var(--line)',
          }} />
        ))}
      </div>
    </div>
  )
}

/**
 * Board size over time, from the DailyDigest snapshots.
 *
 * This chart used to be the top of the public /newsletter archive, where
 * it was doing nobody any good — a visitor has no use for "the board grew
 * from 628 to 1,204", and the digest archive it headed went unread. The
 * snapshots themselves are still written nightly, and they are the only
 * record of how the board actually grew, so the chart moved to the one
 * place the number is genuinely actionable: the owner's console.
 *
 * Absolute totals, not per-day counts — the shape of this line is the
 * question ("is curation still keeping pace?"), which a bar-per-day chart
 * like GrowthSparkline can't show.
 */
function BoardGrowthChart({ growth }: { growth: StatsData['boardGrowth'] }) {
  if (!growth || growth.series.length < 2) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 18 }}>
        Board growth needs at least two daily snapshots — check back tomorrow.
      </div>
    )
  }

  const values = growth.series.map(p => p.totalOpportunities)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const width = 900
  const height = 120

  // A filled area under a polyline: with 90 points, bars would be 6px
  // slivers and the trend would be the one thing you couldn't see.
  const points = growth.series.map((p, i) => {
    const x = (i / (growth.series.length - 1)) * width
    const y = height - ((p.totalOpportunities - min) / range) * (height - 10) - 5
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const net = growth.endTotal - growth.startTotal

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        Board growth — last {growth.days} snapshots
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <MetricCard label="Listings now" value={growth.endTotal} />
        <MetricCard label={`Net added (${growth.days}d)`} value={net >= 0 ? `+${net.toLocaleString()}` : net.toLocaleString()} />
        <MetricCard label="Avg new / day" value={growth.avgNewPerDay} />
        {growth.bestDay && <MetricCard label={`Best day (${growth.bestDay.date})`} value={growth.bestDay.added} />}
      </div>

      <div style={{ background: 'var(--board)', border: '1px solid var(--line)', borderRadius: 2, padding: '12px 12px 8px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
          <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill="var(--pin)" opacity={0.16} />
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="var(--pin)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
          <span>{growth.series[0].date} · {growth.startTotal.toLocaleString()}</span>
          <span>{growth.series[growth.series.length - 1].date} · {growth.endTotal.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

function StatsPanel() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setStats(data)
      })
      .catch(() => setError('Failed to load stats.'))
  }, [])

  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{error}</div>
  if (!stats) return <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <BoardGrowthChart growth={stats.boardGrowth} />

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        Retention — does anyone come back?
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        <MetricCard label="Tracked visitors" value={stats.retention.totalVisitors} />
        <MetricCard label="Returned 2+ days" value={stats.retention.returningVisitors} />
        <MetricCard label="Return rate" value={`${stats.retention.returnRatePct}%`} />
      </div>
      <GrowthSparkline title="Visits" data={stats.retention.last30Days} />

      {stats.retention.weeklyTrend.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Return rate by week — is it actually moving?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {stats.retention.weeklyTrend.map(w => (
              <div key={w.weekOf} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                {w.weekOf}: <strong style={{ color: 'var(--ink)' }}>{w.returnRatePct}%</strong> ({w.totalVisitors})
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.retention.cohorts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            Cohort retention — real day-1 / day-7 / day-30, not a guess
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--ink-3)' }}>Cohort</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--ink-3)' }}>Size</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--ink-3)' }}>Day 1</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--ink-3)' }}>Day 7</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--ink-3)' }}>Day 30</th>
              </tr>
            </thead>
            <tbody>
              {stats.retention.cohorts.map(c => (
                <tr key={c.cohortDate} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '4px 6px', color: 'var(--ink-2)' }}>{c.cohortDate}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--ink-2)' }}>{c.cohortSize}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--ink)' }}>{c.day1Pct === null ? '—' : `${c.day1Pct}%`}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--ink)' }}>{c.day7Pct === null ? '—' : `${c.day7Pct}%`}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--ink)' }}>{c.day30Pct === null ? '—' : `${c.day30Pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
            — means that cohort hasn&apos;t reached that day yet, not a 0%.
          </p>
        </div>
      )}

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8, marginTop: 22 }}>
        Conversion — does saving something lead anywhere?
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        <MetricCard label="Total saved" value={stats.conversion.totalSaved} />
        <MetricCard label="Applied from saved" value={stats.conversion.appliedFromSaved} />
        <MetricCard label="Conversion rate" value={`${stats.conversion.conversionRatePct}%`} />
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8, marginTop: 22 }}>
        Email deliverability — last 30 days
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        <MetricCard label="Suppressed (bounced/complained)" value={stats.email.suppressed} />
      </div>
      <BreakdownBars title="Digest emails by status" data={stats.email.last30DaysByStatus} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 26, marginTop: 22 }}>
        <MetricCard label="Opportunities" value={stats.opportunities.total} />
        <MetricCard label="Opp. verified" value={stats.opportunities.verified} />
        <MetricCard label="Resources" value={stats.resources.total} />
        <MetricCard label="Res. verified" value={stats.resources.verified} />
        <MetricCard label="Subscribers" value={stats.subscribers.total} />
        <MetricCard label="Paid subs" value={stats.subscribers.paid} />
      </div>

      <GrowthSparkline title="Opportunities added" data={stats.opportunities.last30Days} />
      <GrowthSparkline title="Resources added" data={stats.resources.last30Days} />
      <GrowthSparkline title="Subscribers joined" data={stats.subscribers.last30Days} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginTop: 8 }}>
        <div>
          <BreakdownBars title="Opportunities by audience" data={stats.opportunities.byAudience} />
          <BreakdownBars title="Opportunities by source" data={stats.opportunities.bySource} />
        </div>
        <div>
          <BreakdownBars title="Resources by category" data={stats.resources.byCategory} />
          <BreakdownBars title="Resources by source" data={stats.resources.bySource} />
        </div>
      </div>

      <BreakdownBars title="Opportunity submissions by status" data={stats.submissions.byStatus} />

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        Recent scraper runs
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Opportunities</div>
          {stats.scraperRuns.opportunities.slice(0, 5).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', marginBottom: 3 }}>
              {new Date(r.startedAt).toLocaleDateString()} — +{r.added}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Resources</div>
          {stats.scraperRuns.resources.slice(0, 5).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', marginBottom: 3 }}>
              {new Date(r.startedAt).toLocaleDateString()} — +{r.added}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
        Recent policy digests
      </div>
      {stats.digests.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>None generated yet.</div>
      ) : (
        stats.digests.map(d => (
          <div key={d.period} style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', marginBottom: 3 }}>
            {d.period} ({d.periodType}) — {d.itemCount} items
          </div>
        ))
      )}
    </div>
  )
}

interface AdInquiry {
  id: string; companyName: string; contactName: string; contactEmail: string
  website: string | null; message: string; status: string; createdAt: string
}

function AdInquiriesPanel() {
  const [inquiries, setInquiries] = useState<AdInquiry[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/advertise')
      const data = await res.json()
      setInquiries(data.inquiries ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function setStatus(id: string, status: string) {
    await fetch(`/api/advertise/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await refresh()
  }

  if (loading) return <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>
  if (inquiries.length === 0) return <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No inquiries yet.</div>

  return (
    <div>
      {inquiries.map(inq => (
        <div key={inq.id} className="card-box" style={{ padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              {inq.companyName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {new Date(inq.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            {inq.contactName} · {inq.contactEmail}{inq.website ? ` · ${inq.website}` : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 10 }}>
            {inq.message}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(['new', 'contacted', 'closed'] as const).map(s => (
              <button key={s} onClick={() => setStatus(inq.id, s)} style={{
                padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                background: inq.status === s ? 'var(--pin)' : 'var(--card)',
                color: inq.status === s ? 'white' : 'var(--ink-2)',
                border: inq.status === s ? 'none' : '1px solid var(--line)',
              }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScraperPanel() {
  const [runs, setRuns] = useState<ScrapeRun[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const res = await fetch('/api/scrape')
    const data = await res.json()
    setRuns(data.runs ?? [])
  }

  useEffect(() => { refresh() }, [])

  async function runNow() {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/scrape', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Run failed.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
          Runs automatically every hour, in-process — no external cron or Claude session needed.
        </div>
        <button onClick={runNow} disabled={running} style={{
          padding: '8px 16px', borderRadius: 2, border: 'none', cursor: 'pointer',
          background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)',
          fontWeight: 700, fontSize: 12.5, flexShrink: 0,
        }}>
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {runs.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No runs yet.</div>
      ) : (
        runs.map(run => {
          let details: Record<string, { fetched: number; added: number; error: string | null }> = {}
          try { details = JSON.parse(run.details) } catch { /* ignore malformed row */ }
          return (
            <div key={run.id} className="card-box" style={{ padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                {new Date(run.startedAt).toLocaleString()} — added {run.added}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {Object.entries(details).map(([name, s]) => (
                  <div key={name}>
                    {name}: {s.fetched} fetched, {s.added} added{s.error ? ` — error: ${s.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function SubscribersPanel() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancellingAll, setCancellingAll] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/subscribers')
      const data = await res.json()
      setSubscribers(data.subscribers ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function cancelOne(sub: Subscriber) {
    if (!confirm(`Cancel ${sub.email}'s subscription immediately?`)) return
    setBusyId(sub.id)
    setError('')
    try {
      const res = await fetch(`/api/admin/subscribers/${sub.id}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelAll() {
    const activeCount = subscribers.filter(s => s.plan === 'paid').length
    if (activeCount === 0) return
    if (!confirm(`Cancel ALL ${activeCount} active paid subscriptions immediately? This cannot be undone.`)) return
    setCancellingAll(true)
    setError('')
    try {
      const res = await fetch('/api/admin/subscribers/cancel-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to cancel all.')
      if (data.failed?.length) {
        setError(`Cancelled ${data.cancelled}/${data.totalActive}. Failed: ${data.failed.map((f: { email: string }) => f.email).join(', ')}`)
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setCancellingAll(false)
    }
  }

  const activeCount = subscribers.filter(s => s.plan === 'paid').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>
          {subscribers.length} total · {activeCount} active paid
        </div>
        <button
          onClick={cancelAll}
          disabled={cancellingAll || activeCount === 0}
          style={{
            padding: '8px 16px', borderRadius: 2, border: 'none', cursor: activeCount === 0 ? 'default' : 'pointer',
            background: 'var(--danger)', color: 'white', fontFamily: 'var(--font-mono)',
            fontWeight: 700, fontSize: 12.5, flexShrink: 0, opacity: activeCount === 0 ? 0.5 : 1,
          }}
        >
          {cancellingAll ? 'Cancelling all…' : `Cancel all (${activeCount})`}
        </button>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>
      ) : subscribers.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No subscribers yet.</div>
      ) : (
        subscribers.map(sub => (
          <div key={sub.id} className="card-box" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '12px 16px', marginBottom: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sub.email}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {sub.plan} · {sub.subscriptionStatus ?? 'no subscription'} · joined {new Date(sub.subscribedAt).toLocaleDateString()}
                {sub.currentPeriodEnd ? ` · renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : ''}
              </div>
            </div>
            {sub.plan === 'paid' && (
              <button
                onClick={() => cancelOne(sub)}
                disabled={busyId === sub.id}
                style={btnStyle('var(--danger)')}
              >
                {busyId === sub.id ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

const EMPTY_SPONSOR_FORM = { sponsorName: '', sponsorUrl: '', tagline: '', type: 'sidebar', startDate: '', endDate: '' }
const SPONSOR_TYPE_LABEL: Record<string, string> = {
  sidebar: 'Sidebar credit (homepage sidebar, low-key)',
  feed_card: 'Feed card (prominent card near the top of the home feed)',
}

function SponsorPanel() {
  const [slots, setSlots] = useState<SponsoredSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_SPONSOR_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set<K extends keyof typeof EMPTY_SPONSOR_FORM>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sponsor-slots')
      const data = await res.json()
      setSlots(data.slots ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/sponsor-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to book slot.')
      setForm(EMPTY_SPONSOR_FORM)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Cancel this sponsor slot?')) return
    await fetch(`/api/admin/sponsor-slots/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginBottom: 16, lineHeight: 1.6 }}>
        No self-serve checkout here on purpose — book a slot after an off-platform deal (invoice/UPI), and the
        daily Telegram + Discord digest picks it up automatically for the date range below.
      </div>

      <form onSubmit={submit} style={{ maxWidth: 480, marginBottom: 24 }}>
        <input style={inputStyle()} placeholder="Sponsor name" required value={form.sponsorName} onChange={e => set('sponsorName', e.target.value)} />
        <input style={inputStyle()} placeholder="Sponsor URL (https://…)" required value={form.sponsorUrl} onChange={e => set('sponsorUrl', e.target.value)} />
        <input style={inputStyle()} placeholder="Tagline (e.g. Hiring backend engineers)" required value={form.tagline} onChange={e => set('tagline', e.target.value)} />
        <select style={inputStyle()} value={form.type} onChange={e => set('type', e.target.value)}>
          {Object.entries(SPONSOR_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={inputStyle()} type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          <input style={inputStyle()} type="date" required value={form.endDate} onChange={e => set('endDate', e.target.value)} />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button type="submit" disabled={saving} style={{
          padding: '10px 22px', borderRadius: 2, border: 'none', cursor: 'pointer',
          background: 'var(--btn-bg)', color: 'var(--btn-text)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, letterSpacing: '0.02em',
          boxShadow: '3px 3px 0 var(--shadow)',
        }}>
          {saving ? 'Booking…' : 'Book slot'}
        </button>
      </form>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Loading…</div>
      ) : slots.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>No sponsor slots booked.</div>
      ) : (
        slots.map(slot => (
          <div key={slot.id} className="card-box" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '12px 16px', marginBottom: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {slot.sponsorName} — {slot.tagline}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {slot.type === 'feed_card' ? 'Feed card' : 'Sidebar credit'} · {new Date(slot.startDate).toLocaleDateString()} – {new Date(slot.endDate).toLocaleDateString()}
              </div>
            </div>
            <button onClick={() => remove(slot.id)} style={btnStyle('var(--danger)')}>Cancel</button>
          </div>
        ))
      )}
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 3, border: 'none', cursor: 'pointer',
    background: bg, color: 'white', fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700,
  }
}

export function AdminPanel({ adminName }: { adminName: string }) {
  const router = useRouter()
  const [items, setItems] = useState<Opportunity[]>([])
  const [tab, setTab] = useState<'stats' | 'add' | 'queue' | 'all' | 'resources' | 'scraper' | 'subscribers' | 'sponsor' | 'ads'>('stats')
  const [newAdCount, setNewAdCount] = useState(0)

  // useCallback so the effects below can depend on the functions themselves
  // rather than re-listing what they close over. Plain function declarations
  // are new on every render, so naming one in a dependency array re-runs the
  // fetch on every render; these identities only change when tab does.
  const refresh = useCallback(async () => {
    if (tab === 'stats' || tab === 'add' || tab === 'resources' || tab === 'scraper' || tab === 'subscribers' || tab === 'sponsor' || tab === 'ads') return
    const status = tab === 'queue' ? 'unverified' : 'all'
    const res = await fetch(`/api/opportunities?status=${status}`)
    const data = await res.json()
    setItems(data.items ?? [])
  }, [tab])

  const refreshAdCount = useCallback(async () => {
    const res = await fetch('/api/advertise')
    const data = await res.json()
    const inquiries = (data.inquiries ?? []) as { status: string }[]
    setNewAdCount(inquiries.filter(i => i.status === 'new').length)
  }, [])

  // Both of these reach their first setState only after `await fetch(...)`, so
  // nothing is set synchronously in the effect body and no extra render pass
  // happens before paint. The rule can't see through the async call.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])
  // Independent of the active tab, so a new inquiry shows up on the badge
  // the moment the admin opens /admin — not only after they click into "Ad
  // inquiries" — and clears itself as soon as they mark it contacted/closed.
  // `tab` stays in the deps deliberately: refreshAdCount itself is stable, so
  // tab is what re-runs the count as the admin moves between tabs.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refreshAdCount() }, [tab, refreshAdCount])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/auth')
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wordmark size={20} /> <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--ink)' }}>admin — {adminName}</span>
          </span>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
            Log out
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['stats', 'queue', 'add', 'all', 'resources', 'scraper', 'subscribers', 'sponsor', 'ads'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 16px', borderRadius: 2, border: '1.5px solid var(--line)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600,
              background: tab === t ? 'var(--btn-bg)' : 'var(--card)',
              color: tab === t ? 'var(--btn-text)' : 'var(--ink)',
            }}>
              {t === 'stats' ? 'Stats' : t === 'queue' ? 'Needs review' : t === 'add' ? 'Add new' : t === 'all' ? 'All opportunities' : t === 'resources' ? 'Resources' : t === 'scraper' ? 'Scraper' : t === 'subscribers' ? 'Subscribers' : t === 'sponsor' ? 'Sponsor slots' : 'Ad inquiries'}
              {t === 'ads' && newAdCount > 0 && (
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 10,
                  background: tab === t ? 'rgba(255,255,255,0.25)' : 'var(--danger)',
                  color: tab === t ? 'var(--btn-text)' : 'white', fontSize: 11,
                }}>{newAdCount}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'stats' ? (
          <StatsPanel />
        ) : tab === 'add' ? (
          <AddForm onAdded={refresh} />
        ) : tab === 'resources' ? (
          <ResourcesPanel />
        ) : tab === 'scraper' ? (
          <ScraperPanel />
        ) : tab === 'subscribers' ? (
          <SubscribersPanel />
        ) : tab === 'sponsor' ? (
          <SponsorPanel />
        ) : tab === 'ads' ? (
          <AdInquiriesPanel />
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Nothing here.</div>
        ) : (
          items.map(opp => <Row key={opp.id} opp={opp} onChanged={refresh} />)
        )}
      </div>
    </div>
  )
}
