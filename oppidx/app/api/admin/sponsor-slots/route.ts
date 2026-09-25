import { NextRequest, NextResponse } from 'next/server'
import { prisma }      from '@/lib/db'
import { requireAuth } from '@/lib/auth'

/** GET /api/admin/sponsor-slots — admin-only: every booked sponsor slot, newest first. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slots = await prisma.sponsoredSlot.findMany({ orderBy: { startDate: 'desc' } })
  return NextResponse.json({ slots })
}

/**
 * POST /api/admin/sponsor-slots — admin-only: manually book a sponsor slot
 * after an off-platform deal (invoice, UPI transfer, whatever). No payment
 * happens here — this just records that a deal was made and when it runs;
 * the digest cron picks it up automatically from lib/sponsor.ts.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const sponsorName = typeof body.sponsorName === 'string' ? body.sponsorName.trim() : ''
  const sponsorUrl = typeof body.sponsorUrl === 'string' ? body.sponsorUrl.trim() : ''
  const tagline = typeof body.tagline === 'string' ? body.tagline.trim() : ''
  const type = typeof body.type === 'string' ? body.type.trim() : 'sidebar'
  const startDate = typeof body.startDate === 'string' ? new Date(body.startDate) : null
  const endDate = typeof body.endDate === 'string' ? new Date(body.endDate) : null

  if (!sponsorName) return NextResponse.json({ error: 'Sponsor name is required.' }, { status: 400 })
  if (!/^https?:\/\//.test(sponsorUrl)) return NextResponse.json({ error: 'Sponsor URL must start with http:// or https://.' }, { status: 400 })
  if (!tagline) return NextResponse.json({ error: 'Tagline is required.' }, { status: 400 })
  if (!['sidebar', 'feed_card'].includes(type)) return NextResponse.json({ error: 'Invalid ad type.' }, { status: 400 })
  if (!startDate || isNaN(startDate.getTime()) || !endDate || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Valid start and end dates are required.' }, { status: 400 })
  }
  if (endDate < startDate) return NextResponse.json({ error: 'End date must be on or after the start date.' }, { status: 400 })

  const slot = await prisma.sponsoredSlot.create({
    data: { sponsorName, sponsorUrl, tagline, type, startDate, endDate },
  })

  return NextResponse.json({ ok: true, slot })
}
