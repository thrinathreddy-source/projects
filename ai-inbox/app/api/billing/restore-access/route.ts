import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { createSubscriberSession } from '@/lib/subscriberSession'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/**
 * POST /api/billing/restore-access — public. Re-identifies this browser as
 * an existing subscriber (expired cookie, new device) without going through
 * checkout again. Always returns the same generic success message whether
 * or not the email matched anything, so this can't be used to test which
 * emails are subscribed.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`restore-access:${getClientIp(req)}`, 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const subscriber = await prisma.subscriber.findUnique({ where: { email } })
  if (subscriber) {
    await createSubscriberSession(subscriber.id)
  }

  return NextResponse.json({ ok: true })
}
