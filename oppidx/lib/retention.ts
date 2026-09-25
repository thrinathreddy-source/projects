import { prisma } from '@/lib/db'

/** ISO 8601 week string, e.g. "2026-W30" — Thursday-anchored per the ISO
 * spec so the week number is stable regardless of which day this runs. */
export function isoWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** The current, live Gate-0 retention numbers — shared by the admin Stats
 * tab (live read) and the weekly snapshot cron (durable record), so the
 * two never drift apart. */
export async function computeRetention() {
  const visitorDayCounts = await prisma.visitLog.groupBy({ by: ['anonId'], _count: { date: true } })
  const totalVisitors = visitorDayCounts.length
  const returningVisitors = visitorDayCounts.filter(v => v._count.date >= 2).length
  const returnRatePct = totalVisitors > 0 ? Math.round((returningVisitors / totalVisitors) * 100) : 0
  return { totalVisitors, returningVisitors, returnRatePct }
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000)
}

export interface CohortRow {
  cohortDate: string
  cohortSize: number
  day1Pct: number | null
  day7Pct: number | null
  day30Pct: number | null
}

/**
 * Real day-1/7/30 cohort retention, computed directly from VisitLog — no
 * new table needed, the raw (anonId, date) rows already have everything.
 * A visitor's cohort is their first-ever visit date; day7/day30 use a
 * window (2-7 days out, 8-30 days out) rather than an exact-day match,
 * since a young, low-traffic site would otherwise show near-constant
 * zeroes from visitors landing one day off an exact mark — same
 * bucketed-window approach real retention tools use. A cohort too young
 * to have completed a window shows null for that column (not a false 0%)
 * — e.g. a cohort from 10 days ago has no real Day 30 answer yet.
 */
export async function computeCohortRetention(limitCohorts = 30): Promise<CohortRow[]> {
  const rows = await prisma.visitLog.findMany({ select: { anonId: true, date: true }, orderBy: { date: 'asc' } })

  const byVisitor = new Map<string, string[]>()
  for (const r of rows) {
    const list = byVisitor.get(r.anonId)
    if (list) list.push(r.date)
    else byVisitor.set(r.anonId, [r.date])
  }

  const cohorts = new Map<string, { size: number; day1: number; day7: number; day30: number }>()
  const today = new Date().toISOString().slice(0, 10)

  for (const dates of byVisitor.values()) {
    const cohortDate = dates[0]
    const offsets = dates.slice(1).map(d => daysBetween(cohortDate, d))
    const entry = cohorts.get(cohortDate) ?? { size: 0, day1: 0, day7: 0, day30: 0 }
    entry.size += 1
    if (offsets.some(o => o === 1)) entry.day1 += 1
    if (offsets.some(o => o >= 2 && o <= 7)) entry.day7 += 1
    if (offsets.some(o => o >= 8 && o <= 30)) entry.day30 += 1
    cohorts.set(cohortDate, entry)
  }

  const result: CohortRow[] = [...cohorts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limitCohorts)
    .map(([cohortDate, c]) => {
      const age = daysBetween(cohortDate, today)
      return {
        cohortDate,
        cohortSize: c.size,
        day1Pct: age >= 1 ? Math.round((c.day1 / c.size) * 100) : null,
        day7Pct: age >= 7 ? Math.round((c.day7 / c.size) * 100) : null,
        day30Pct: age >= 30 ? Math.round((c.day30 / c.size) * 100) : null,
      }
    })

  return result
}
