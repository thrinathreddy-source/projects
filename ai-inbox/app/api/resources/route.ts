import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { requireAuth }               from '@/lib/auth'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { VALID_AUDIENCES, VALID_CATEGORIES } from '@/lib/resources/validate'

const PAGE_SIZE = 24

/**
 * GET /api/resources — public listing, free to browse in full (no paywall —
 * unlike /api/opportunities, this room has no free-tier limit).
 * Public callers only ever see verified, non-deleted entries. An
 * authenticated admin may pass ?status=unverified or ?status=all for /admin.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const category = searchParams.get('category')
  const audience = searchParams.get('audience')
  const search   = searchParams.get('search')?.trim()
  const status   = searchParams.get('status')
  const source   = searchParams.get('source')
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)

  const where: Record<string, unknown> = { deletedAt: null }
  const isAdminQuery = status === 'unverified' || status === 'all'

  if (isAdminQuery) {
    const admin = await requireAuth()
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (status === 'unverified') where.verified = false
  } else {
    where.verified = true
  }

  if (category) where.category = category
  // "native" is the only value used publicly (see the Resources page's
  // Learn section, which needs the written-on-OppIDX articles specifically —
  // not whatever the last 24 scraped items in that category happen to be).
  if (source === 'native') where.source = 'native'
  if (audience) {
    const list = audience.split(',').map(a => a.trim()).filter(a => VALID_AUDIENCES.includes(a))
    if (list.length) where.audience = { in: list }
  }
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
    ]
  }

  const skip = (page - 1) * PAGE_SIZE

  const [items, total] = await Promise.all([
    prisma.resource.findMany({ where, orderBy: { addedAt: 'desc' }, skip, take: PAGE_SIZE }),
    prisma.resource.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE })
}

/** POST /api/resources — admin-only create (see /api/resources/submit for the public path). */
export async function POST(req: NextRequest) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(`create-resource:${getClientIp(req)}`, 60_000, 20)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { title, description, url, category, audience, verified, source, body: articleBody } = body as Record<string, unknown>

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  }
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'A valid URL is required.' }, { status: 400 })
  }
  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
  }
  if (typeof audience !== 'string' || !VALID_AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: 'Invalid audience.' }, { status: 400 })
  }

  const created = await prisma.resource.create({
    data: {
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      url: url.trim(),
      category,
      audience,
      verified: typeof verified === 'boolean' ? verified : true,
      source: typeof source === 'string' && source ? source : 'admin',
      body: typeof articleBody === 'string' ? articleBody.trim() : '',
    },
  })

  return NextResponse.json({ ok: true, item: created })
}
