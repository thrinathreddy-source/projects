import { NextResponse } from 'next/server'
import { prisma }      from '@/lib/db'
import { requireAuth } from '@/lib/auth'

/** DELETE /api/admin/sponsor-slots/[id] — admin-only: cancel/remove a booked slot. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.sponsoredSlot.delete({ where: { id } }).catch(() => null)

  return NextResponse.json({ ok: true })
}
