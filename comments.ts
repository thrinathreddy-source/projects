import { prisma } from '@/lib/db'

/** Batched discussion counts for a page of feed items — one groupBy, never
 * a query per card. A count of 0 is filtered out by the caller (see
 * lib/opportunityStats.ts's threshold pattern): nobody sees "0 comments,"
 * a card with no discussion yet just doesn't show the line at all. */
export async function getCommentCounts(itemType: string, itemIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const id of itemIds) result[id] = 0
  if (itemIds.length === 0) return result

  const rows = await prisma.comment.groupBy({
    by: ['itemId'],
    where: { itemType, itemId: { in: itemIds }, deletedAt: null },
    _count: { _all: true },
  })
  for (const r of rows) result[r.itemId] = r._count._all
  return result
}

export async function listComments(itemType: string, itemId: string) {
  return prisma.comment.findMany({
    where: { itemType, itemId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
}

export async function addComment(itemType: string, itemId: string, subscriberId: string, body: string) {
  const trimmed = body.trim().slice(0, 2000)
  if (!trimmed) throw new Error('Comment cannot be empty.')
  return prisma.comment.create({
    data: { itemType, itemId, subscriberId, body: trimmed },
  })
}

/** Soft delete — admin moderation only (see the [commentId] DELETE route).
 * Never a hard delete: keeps the row for abuse-history purposes the same
 * way Opportunity/Resource soft-deletes already do, just excluded from
 * every read path via the deletedAt: null filter above. */
export async function deleteComment(id: string) {
  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } })
}
