import { prisma } from '@/lib/db'
import { listOrEmpty } from '@/lib/buildParams'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { parseJsonArray } from '@/lib/safeJson'
import type { Opportunity } from '@/types'

/** UTC calendar date as "2026-07-25" — the DailyDigest.date / URL slug format. */
export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Snapshots today's social-digest picks as a durable, shareable page —
 * first run of the day wins (ignores a second same-day cron trigger, e.g.
 * a manual workflow_dispatch retry) so an already-shared link never
 * changes under whoever it was sent to.
 */
export async function snapshotDailyDigest(opportunityIds: string[]) {
  const date = todayDateString()

  const [totalOpportunities, newLast24h] = await Promise.all([
    prisma.opportunity.count({ where: { verified: true, deletedAt: null } }),
    prisma.opportunity.count({
      where: { verified: true, deletedAt: null, addedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    }),
  ])

  try {
    await prisma.dailyDigest.create({
      data: { date, opportunityIds: JSON.stringify(opportunityIds), totalOpportunities, newLast24h },
    })
  } catch (e) {
    if (!isUniqueConstraintError(e)) throw e
    // already snapshotted today — leave the existing page as the durable record
  }
}

export async function getDigestByDate(date: string) {
  const digest = await prisma.dailyDigest.findUnique({ where: { date } })
  if (!digest) return null
  const ids = parseJsonArray<string>(digest.opportunityIds, `DailyDigest.opportunityIds ${date}`)
  const rows = await prisma.opportunity.findMany({ where: { id: { in: ids }, deletedAt: null } })
  const items = rows.map(r => ({ ...r, addedAt: r.addedAt.toISOString() })) as unknown as Opportunity[]
  // Preserve the original pick order rather than the DB's default ordering.
  const byId = new Map(items.map(o => [o.id, o]))
  const opportunities = ids.map(id => byId.get(id)).filter((o): o is NonNullable<typeof o> => !!o)
  return { ...digest, opportunities }
}

/** Most recent digests, newest first — powers the /newsletter archive and
 * its board-growth chart. */
export async function getRecentDigests(limit: number) {
  // Empty rather than throwing when the database is unreachable — /newsletter
  // is statically prerendered, so a failure here took the whole build down.
  // See lib/buildParams.ts.
  return listOrEmpty('getRecentDigests', () =>
    prisma.dailyDigest.findMany({ orderBy: { date: 'desc' }, take: limit })
  )
}
