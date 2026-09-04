import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { requireAuth }               from '@/lib/auth'

const VALID_STATUSES = ['new', 'contacted', 'closed']

/** PATCH /api/advertise/[id] — admin-only: update inquiry status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const status = typeof body?.status === 'string' ? body.status : ''
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const updated = await prisma.adInquiry.update({ where: { id }, data: { status } }).catch(() => null)
  if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, item: updated })
}
