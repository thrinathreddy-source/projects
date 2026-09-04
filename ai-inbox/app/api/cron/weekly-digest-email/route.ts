import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { prisma } from '@/lib/db'
import { sendWeeklyDigestBatch } from '@/lib/email'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { digestRecipients } from '@/lib/digestRecipients'
import { runCronPass } from '@/lib/cronGuard'

const TOP_PICKS_COUNT = 10
const WEEK_MS = 7 * 24 * 60 * 60_000

/**
 * GET /api/cron/weekly-digest-email — the only recurring email OppIDX
 * sends (see lib/email.ts) — once a week, the top 10 opportunities added
 * in the last 7 days, ranked by real view count. Deliberately not "top 10
 * all-time by views": that would show the same evergreen listings every
 * week forever and never feel like a fresh weekly read. If fewer than 10
 * genuinely qualify from the last 7 days, it backfills from the wider
 * verified board rather than fabricate — a short list some weeks is more
 * honest than a padded one.
 *
 * Idempotent per calendar date (DigestEmailLog), same pattern as every
 * other snapshot/send in this codebase — a manual workflow_dispatch retry
 * the same day never double-emails anyone already logged for that date.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not set up yet.' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ sent: false, reason: 'Resend is not configured yet.' })
  }

  return runCronPass('weekly-digest-email', async () => {
  const since = new Date(Date.now() - WEEK_MS)
  const today = new Date().toISOString().slice(0, 10)

  const recentTop = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, addedAt: { gte: since } },
    orderBy: [{ viewCount: 'desc' }, { addedAt: 'desc' }],
    take: TOP_PICKS_COUNT,
  })

  let topPicks = recentTop
  if (topPicks.length < TOP_PICKS_COUNT) {
    const backfill = await prisma.opportunity.findMany({
      where: { verified: true, deletedAt: null, id: { notIn: topPicks.map(o => o.id) } },
      orderBy: [{ viewCount: 'desc' }, { addedAt: 'desc' }],
      take: TOP_PICKS_COUNT - topPicks.length,
    })
    topPicks = [...topPicks, ...backfill]
  }

  if (topPicks.length === 0) {
    return { sent: false, reason: 'nothing to pick from' }
  }

  const [totalOpportunities, newLast7Days, alreadyLogged, eligible] = await Promise.all([
    prisma.opportunity.count({ where: { verified: true, deletedAt: null } }),
    prisma.opportunity.count({ where: { verified: true, deletedAt: null, addedAt: { gte: since } } }),
    prisma.digestEmailLog.findMany({ where: { date: today }, select: { subscriberId: true, status: true } }),
    prisma.subscriber.findMany({
      where: { unsubscribedFromDigest: false, emailSuppressedReason: null },
      select: { id: true, email: true },
    }),
  ])

  // See lib/digestRecipients.ts for why a 'failed' row must not block a retry
  // while every other status must. Guarded by lib/digestRecipients.test.ts.
  const subscribers = digestRecipients(eligible, alreadyLogged)

  let emailsSent = 0
  let emailsFailed = 0

  if (subscribers.length > 0) {
    const weekRangeLabel = `${since.toLocaleDateString('en-IN', { month: 'long', day: 'numeric', timeZone: 'UTC' })} – ${new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`

    const results = await sendWeeklyDigestBatch(
      subscribers.map(s => ({ subscriberId: s.id, email: s.email })),
      {
        weekRangeLabel,
        totalOpportunities,
        newLast7Days,
        topPicks: topPicks.map(o => ({ title: o.title, org: o.org, id: o.id, slug: o.slug, description: o.description })),
      }
    )

    for (const r of results) {
      if (r.error) {
        emailsFailed++
        console.error('[weekly-digest-email] email failed for subscriber', r.subscriberId, r.error)
      } else {
        emailsSent++
      }
      // upsert, not create: a retry for a previously-failed subscriber already
      // has a row for (subscriberId, date), which is unique. A create would
      // violate that constraint and get swallowed as "already logged", losing
      // the retry's outcome and leaving the row stuck at 'failed' forever.
      const status = r.error ? 'failed' : 'sent'
      try {
        await prisma.digestEmailLog.upsert({
          where: { subscriberId_date: { subscriberId: r.subscriberId, date: today } },
          create: { subscriberId: r.subscriberId, date: today, resendId: r.resendId, status },
          update: { resendId: r.resendId, status },
        })
      } catch (e) {
        if (!isUniqueConstraintError(e)) console.error('[weekly-digest-email] digest log write failed:', e)
      }
    }
  }

  return { topPicksCount: topPicks.length, emailsSent, emailsFailed }
  })
}
