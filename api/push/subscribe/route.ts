import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { getCurrentSubscriber, createSubscriberSession } from '@/lib/subscriberSession'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/**
 * POST /api/push/subscribe — registers a browser's Web Push subscription
 * against a Subscriber, same lightweight email-based identity as
 * /api/saved. Needed so lib/push.ts can compare newly added opportunities
 * against what that subscriber has saved.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`push-subscribe:${getClientIp(req)}`, 60_000, 10)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const subscription = body?.subscription
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 })
  }

  let subscriber = await getCurrentSubscriber()

  if (!subscriber) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!isPlausibleEmail(email)) {
      return NextResponse.json({ error: 'needsEmail' }, { status: 401 })
    }
    subscriber = await prisma.subscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    })
    await createSubscriberSession(subscriber.id)
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { subscriberId: subscriber.id, endpoint, p256dh, auth },
    update: { subscriberId: subscriber.id, p256dh, auth },
  })

  return NextResponse.json({ ok: true })
}
