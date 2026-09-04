import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { requireAuth }               from '@/lib/auth'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { checkContentSafety }        from '@/lib/platform/moderation'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/** GET /api/advertise — admin-only: list inquiries. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inquiries = await prisma.adInquiry.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ inquiries })
}

/**
 * POST /api/advertise — public lead-capture form. Keyword-based moderation
 * (lib/platform/moderation.ts — no API calls, no cost) runs on the message
 * before anything is stored — this is the one open free-text field on an
 * otherwise-unauthenticated public form, so it's the one that needs a gate.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`advertise:${getClientIp(req)}`, 60_000, 3)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const companyName  = typeof body.companyName === 'string' ? body.companyName.trim() : ''
  const contactName  = typeof body.contactName === 'string' ? body.contactName.trim() : ''
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : ''
  const website       = typeof body.website === 'string' ? body.website.trim() : ''
  const message       = typeof body.message === 'string' ? body.message.trim() : ''

  if (!companyName) return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
  if (!contactName) return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
  if (!isPlausibleEmail(contactEmail)) return NextResponse.json({ error: 'A valid contact email is required.' }, { status: 400 })
  if (!message || message.length < 10) return NextResponse.json({ error: 'Tell us a bit about what you have in mind (10+ characters).' }, { status: 400 })

  const safety = await checkContentSafety([companyName, contactName, message])
  if (safety.flagged) {
    return NextResponse.json({ error: 'That message could not be submitted. Try rewording it.' }, { status: 400 })
  }

  const created = await prisma.adInquiry.create({
    data: { companyName, contactName, contactEmail, website: website || null, message },
  })

  return NextResponse.json({ ok: true, id: created.id })
}
