import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { requireAuth }               from '@/lib/auth'
import { inferGeo }                  from '@/lib/scraper/geo'
import { templateOpportunitySummary } from '@/lib/scraper/summarize'

/** PATCH /api/opportunities/[id] — admin-only edit/verify/soft-delete. */
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
  if (typeof b.url === 'string') {
    const url = b.url.trim()
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: 'URL must start with http:// or https://.' }, { status: 400 })
    }
    data.url = url
  }
  if (typeof b.org === 'string' || b.org === null) data.org = b.org
  if (typeof b.audience === 'string') data.audience = b.audience
  if (typeof b.eligibility === 'string') data.eligibility = b.eligibility
  if (typeof b.prepResources === 'string') data.prepResources = b.prepResources
  if (typeof b.difficulty === 'string') data.difficulty = b.difficulty
  if (typeof b.tags === 'string') data.tags = b.tags
  if (typeof b.location === 'string' || b.location === null) {
    data.location = b.location
    const geo = inferGeo(b.location as string | null)
    data.region = geo.region
    data.country = geo.country
  }
  if (typeof b.compType === 'string' || b.compType === null) data.compType = b.compType
  if (typeof b.verified === 'boolean') data.verified = b.verified
  if (typeof b.featured === 'boolean') data.featured = b.featured
  if (b.delete === true) data.deletedAt = new Date()
  if (b.delete === false) data.deletedAt = null

  // Keep `summary` in sync whenever an edit touches any field it's built
  // from — otherwise an admin correcting the org/location/comp type on a
  // listing would leave a stale summary describing the old values.
  const summaryInputs = ['org', 'location', 'audience', 'compType'] as const
  if (summaryInputs.some(k => k in data)) {
    const current = await prisma.opportunity.findUnique({
      where: { id }, select: { org: true, location: true, audience: true, compType: true, employmentType: true },
    })
    if (current) {
      data.summary = templateOpportunitySummary({
        org: (data.org ?? current.org) as string | null,
        location: (data.location ?? current.location) as string | null,
        audience: (data.audience ?? current.audience) as string,
        compType: (data.compType ?? current.compType) as string | null,
        employmentType: current.employmentType,
      })
    }
  }

  const updated = await prisma.opportunity.update({ where: { id }, data }).catch(() => null)
  if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, item: updated })
}
