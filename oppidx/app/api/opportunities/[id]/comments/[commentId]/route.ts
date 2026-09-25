import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { deleteComment } from '@/lib/comments'

/** DELETE /api/opportunities/[id]/comments/[commentId] — admin-only
 * moderation. Soft delete (see lib/comments.ts) — the row stays, just
 * stops showing up anywhere public. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await params
  await deleteComment(commentId).catch(() => null)

  return NextResponse.json({ ok: true })
}
