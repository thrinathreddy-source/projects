/**
 * Generates the shareable "policy actions" digest — a snapshot, taken once
 * a day (and once a week), of what Pulse's government/regulatory
 * sources (PIB, RBI, SEBI — see lib/platform/pulseFeed.ts) reported. Reads
 * from Supabase (the live Pulse data), writes to Prisma's PolicyDigest
 * table (the durable, shareable snapshot) — see the model comment in
 * prisma/schema.prisma for why a snapshot is necessary rather than
 * computing a digest from live Pulse data on every page view.
 */

import { prisma } from '@/lib/db'
import { supabaseAdmin } from '@/lib/platform/supabase'
import { isEnglish } from '@/lib/platform/pulseFeed'
import { writeNarrativeSummary } from '@/lib/policyDigest/summarize'
import { parseJsonArray } from '@/lib/safeJson'

export interface DigestItem {
  title: string
  url: string
  category: string
  source: string
  // Absent on digests generated before supabase-schema-pulse-v5.sql ran —
  // genuinely unknown then, NOT assumed to be 'IN'. Once this file started
  // ingesting a second country (US), rows fetched before that migration
  // are a real mix of both, not all India — every reader
  // (lib/opportunityPulseMap.ts) treats a missing country as "don't filter
  // by country for this item" rather than guessing wrong and hiding real
  // matches for non-India opportunities.
  country?: string
}

interface PulseHeadlineRow {
  title: string
  url: string
  category: string
  source: string
  source_type: string
  fetched_at: string
  country?: string
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10) // "2026-07-24"
}

/** ISO 8601 week string, e.g. "2026-W30" — Thursday-anchored per the ISO
 * spec so the week number is stable regardless of which day generation runs. */
function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** The old, purely templated line — "40 policy actions across 3
 * categories." Nobody reads that. Still used as the fallback when there's
 * nothing to summarize, or if the AI rewrite (writeNarrativeSummary)
 * fails for any reason — the digest should never be left with an empty
 * intro. */
function templateSummary(items: DigestItem[], periodLabel: string): string {
  if (items.length === 0) return `No policy actions captured for ${periodLabel}.`
  const categories = new Set(items.map(i => i.category)).size
  return `${items.length} policy action${items.length === 1 ? '' : 's'} across ${categories} categor${categories === 1 ? 'y' : 'ies'} — ${periodLabel}.`
}

export async function generateDailyDigest(): Promise<{ period: string; itemCount: number }> {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.')

  // Selects `country` optimistically; falls back to the pre-v5 column set
  // if that migration (supabase-schema-pulse-v5.sql) hasn't run yet, same
  // "never let a not-yet-applied migration break something that worked
  // yesterday" rule as the refresh cron. `columnExists` tracks which case
  // we're in — deliberately NOT defaulted to 'IN' when it's false, since
  // this file now ingests a second country: a blanket 'IN' default would
  // silently zero out every non-India opportunity's real, already-fetched
  // matches until the migration lands, which is a worse regression than
  // just leaving country unknown for everyone a little longer.
  let data: PulseHeadlineRow[] | null = null
  let columnExists = true
  const withCountry = await supabaseAdmin
    .from('pulse_headlines')
    .select('title, url, category, source, source_type, fetched_at, country')
    .eq('source_type', 'government')
    .order('fetched_at', { ascending: false })

  if (!withCountry.error) {
    data = withCountry.data as PulseHeadlineRow[]
  } else {
    columnExists = false
    const withoutCountry = await supabaseAdmin
      .from('pulse_headlines')
      .select('title, url, category, source, source_type, fetched_at')
      .eq('source_type', 'government')
      .order('fetched_at', { ascending: false })
    if (withoutCountry.error) throw withoutCountry.error
    data = withoutCountry.data as PulseHeadlineRow[]
  }

  const items: DigestItem[] = (data ?? [])
    .filter(h => isEnglish(h.title))
    .map(h => ({ title: h.title, url: h.url, category: h.category, source: h.source, country: columnExists ? h.country : undefined }))

  const period = todayDateString()
  const summary = await writeNarrativeSummary(items, 'today', templateSummary(items, 'today'))

  await prisma.policyDigest.upsert({
    where: { period },
    update: { summary, items: JSON.stringify(items) },
    create: { period, periodType: 'daily', summary, items: JSON.stringify(items) },
  })

  return { period, itemCount: items.length }
}

/** Weekly digest is built from the past 7 days' already-generated daily
 * digests (Prisma, not live Supabase) — consistent by construction with
 * whatever each day actually showed, not a re-derived guess. */
export async function generateWeeklyDigest(): Promise<{ period: string; itemCount: number }> {
  const since = new Date(Date.now() - 7 * 86400_000)
  const dailies = await prisma.policyDigest.findMany({
    where: { periodType: 'daily', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })

  const seen = new Set<string>()
  const items: DigestItem[] = []
  for (const daily of dailies) {
    // Skip a malformed daily rather than fail the whole weekly roll-up.
    const dailyItems = parseJsonArray<DigestItem>(daily.items, `PolicyDigest.items ${daily.period}`)
    for (const item of dailyItems) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      items.push(item)
    }
  }

  const period = isoWeekString(new Date())
  const summary = await writeNarrativeSummary(items, 'this week', templateSummary(items, 'this week'))

  await prisma.policyDigest.upsert({
    where: { period },
    update: { summary, items: JSON.stringify(items) },
    create: { period, periodType: 'weekly', summary, items: JSON.stringify(items) },
  })

  return { period, itemCount: items.length }
}
