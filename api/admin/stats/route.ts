import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { requireAuth }  from '@/lib/auth'
import { computeRetention, computeCohortRetention } from '@/lib/retention'

const DAYS = 30
const DAY_MS = 86_400_000

/** Board-growth history runs longer than the 30-day windows above — it's
 * the one series here measured in months rather than weeks, and a quarter
 * is where a curation pace actually becomes visible. */
const GROWTH_DAYS = 90

/** Buckets a list of dates into daily counts for the last `DAYS` days,
 * oldest first — zero-filled so the frontend never has to guess about a
 * missing day (no signal that day vs. no data that day). */
function bucketByDay(dates: Date[]): { date: string; count: number }[] {
  const buckets = new Map<string, number>()
  const now = new Date()
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS)
    buckets.set(d.toISOString().slice(0, 10), 0)
  }
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }))
}

/** GET /api/admin/stats — admin-only aggregate dashboard data across every
 * content type. Nothing here is cached — small enough tables (low
 * thousands of rows) that a live count is cheap and always accurate,
 * which matters more than shaving a few hundred ms for a page only the
 * site owner loads. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const since = new Date(Date.now() - DAYS * DAY_MS)
  const sinceDateStr = since.toISOString().slice(0, 10)

  const [
    oppTotal, oppVerified, oppByAudience, oppBySource, oppRecentDates,
    resTotal, resVerified, resByCategory, resBySource, resRecentDates,
    subTotal, subPaid, subRecentDates,
    submissionsByStatus,
    scrapeRuns, resourceScrapeRuns,
    digests,
    recentVisitDates,
    totalSaved, appliedFromSaved,
    weeklySnapshots,
    emailByStatus, suppressedSubscribers,
    boardGrowthRows,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { deletedAt: null } }),
    prisma.opportunity.count({ where: { deletedAt: null, verified: true } }),
    prisma.opportunity.groupBy({ by: ['audience'], where: { deletedAt: null }, _count: true }),
    prisma.opportunity.groupBy({ by: ['source'], where: { deletedAt: null }, _count: true }),
    prisma.opportunity.findMany({ where: { deletedAt: null, addedAt: { gte: since } }, select: { addedAt: true } }),

    prisma.resource.count({ where: { deletedAt: null } }),
    prisma.resource.count({ where: { deletedAt: null, verified: true } }),
    prisma.resource.groupBy({ by: ['category'], where: { deletedAt: null }, _count: true }),
    prisma.resource.groupBy({ by: ['source'], where: { deletedAt: null }, _count: true }),
    prisma.resource.findMany({ where: { deletedAt: null, addedAt: { gte: since } }, select: { addedAt: true } }),

    prisma.subscriber.count(),
    prisma.subscriber.count({ where: { plan: 'paid' } }),
    prisma.subscriber.findMany({ where: { subscribedAt: { gte: since } }, select: { subscribedAt: true } }),

    prisma.opportunitySubmission.groupBy({ by: ['status'], _count: true }),

    prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.resourceScrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),

    prisma.policyDigest.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),

    prisma.visitLog.findMany({ where: { date: { gte: sinceDateStr } }, select: { date: true } }),

    // Law 5's real signal: of everything saved, how much did someone
    // actually go on to click Apply for (see app/api/opportunities/[id]/view).
    prisma.savedOpportunity.count(),
    prisma.savedOpportunity.count({ where: { appliedAt: { not: null } } }),

    prisma.retentionSnapshot.findMany({ orderBy: { weekOf: 'desc' }, take: 12 }),

    prisma.digestEmailLog.groupBy({ by: ['status'], where: { date: { gte: sinceDateStr } }, _count: true }),
    prisma.subscriber.count({ where: { emailSuppressedReason: { not: null } } }),

    // The daily-digest snapshots, read as what they actually are: a
    // day-by-day time series of board size that nothing else records.
    // The public /newsletter archive they used to feed is gone (it
    // redirects to /), but the rows keep being written by the social
    // digest cron and they are the only history of how the board grew.
    prisma.dailyDigest.findMany({
      orderBy: { date: 'desc' },
      take: GROWTH_DAYS,
      select: { date: true, totalOpportunities: true, newLast24h: true },
    }),
  ])

  const retention = await computeRetention()
  const cohorts = await computeCohortRetention()

  const digestItemCount = (items: string) => {
    try { return (JSON.parse(items) as unknown[]).length } catch { return 0 }
  }

  // Oldest-first, so the series reads left-to-right as a chart.
  const growthSeries = [...boardGrowthRows].reverse()
  const growthAdds = growthSeries.map(r => r.newLast24h)
  const bestDay = growthSeries.reduce<{ date: string; added: number } | null>(
    (best, r) => (!best || r.newLast24h > best.added ? { date: r.date, added: r.newLast24h } : best),
    null,
  )
  const boardGrowth = {
    days: growthSeries.length,
    series: growthSeries,
    startTotal: growthSeries[0]?.totalOpportunities ?? 0,
    endTotal: growthSeries[growthSeries.length - 1]?.totalOpportunities ?? 0,
    // Rounded to one decimal: an average of 6 vs 6.4 listings a day is a
    // ~150/year difference, and this is the number that says whether
    // curation is keeping pace.
    avgNewPerDay: growthAdds.length
      ? Math.round((growthAdds.reduce((a, b) => a + b, 0) / growthAdds.length) * 10) / 10
      : 0,
    bestDay,
  }

  return NextResponse.json({
    opportunities: {
      total: oppTotal,
      verified: oppVerified,
      unverified: oppTotal - oppVerified,
      byAudience: oppByAudience.map(r => ({ label: r.audience, count: r._count })),
      bySource: oppBySource.map(r => ({ label: r.source, count: r._count })),
      last30Days: bucketByDay(oppRecentDates.map(r => r.addedAt)),
    },
    resources: {
      total: resTotal,
      verified: resVerified,
      unverified: resTotal - resVerified,
      byCategory: resByCategory.map(r => ({ label: r.category, count: r._count })),
      bySource: resBySource.map(r => ({ label: r.source, count: r._count })),
      last30Days: bucketByDay(resRecentDates.map(r => r.addedAt)),
    },
    subscribers: {
      total: subTotal,
      paid: subPaid,
      free: subTotal - subPaid,
      last30Days: bucketByDay(subRecentDates.map(r => r.subscribedAt)),
    },
    submissions: {
      byStatus: submissionsByStatus.map(r => ({ label: r.status, count: r._count })),
    },
    scraperRuns: {
      opportunities: scrapeRuns.map(r => ({ startedAt: r.startedAt, added: r.added })),
      resources: resourceScrapeRuns.map(r => ({ startedAt: r.startedAt, added: r.added })),
    },
    digests: digests.map(d => ({
      period: d.period, periodType: d.periodType, itemCount: digestItemCount(d.items), createdAt: d.createdAt,
    })),
    retention: {
      ...retention,
      last30Days: bucketByDay(recentVisitDates.map(v => new Date(`${v.date}T00:00:00Z`))),
      weeklyTrend: [...weeklySnapshots].reverse().map(s => ({
        weekOf: s.weekOf, returnRatePct: s.returnRatePct, totalVisitors: s.totalVisitors,
      })),
      cohorts,
    },
    conversion: {
      totalSaved,
      appliedFromSaved,
      conversionRatePct: totalSaved > 0 ? Math.round((appliedFromSaved / totalSaved) * 100) : 0,
    },
    email: {
      last30DaysByStatus: emailByStatus.map(r => ({ label: r.status, count: r._count })),
      suppressed: suppressedSubscribers,
    },
    boardGrowth,
  })
}
