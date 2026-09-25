import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { requireAuth }               from '@/lib/auth'
import { VALID_AUDIENCES, VALID_CATEGORIES } from '@/lib/resources/validate'

/** PATCH /api/resources/[id] — admin-only edit/verify/soft-delete (the "way to remove them" from admin). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  const b = body as Record<string, unknown>

  if (typeof b.title === 'string') data.title = b.title.trim()
  if (typeof b.description === 'string') data.description = b.description.trim()
  if (typeof b.body === 'string') data.body = b.body.trim()
  if (typeof b.url === 'string') {
    const url = b.url.trim()
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: 'URL must start with http:// or https://.' }, { status: 400 })
    }
    data.url = url
  }
  if (typeof b.category === 'string') {
    if (!VALID_CATEGORIES.includes(b.category)) {
      return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
    }
    data.category = b.category
  }
  if (typeof b.audience === 'string') {
    if (!VALID_AUDIENCES.includes(b.audience)) {
      return NextResponse.json({ error: 'Invalid audience.' }, { status: 400 })
    }
    data.audience = b.audience
  }
  if (typeof b.verified === 'boolean') data.verified = b.verified
  if (b.delete === true) data.deletedAt = new Date()
  if (b.delete === false) data.deletedAt = null

  const updated = await prisma.resource.update({ where: { id }, data }).catch(() => null)
  if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, item: updated })
}
