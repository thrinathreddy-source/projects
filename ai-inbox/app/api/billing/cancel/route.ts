import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { razorpay } from '@/lib/billing/razorpay'
import { getCurrentSubscriber } from '@/lib/subscriberSession'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/**
 * POST /api/billing/cancel — public, self-service. Cancels a subscriber's
 * own paid subscription. Deliberately reachable by email alone, no session
 * or password required — same tradeoff already accepted for
 * /api/billing/restore-access (identity here is "knows the email", not
 * verified), because the alternative (no self-cancel path at all) is worse:
 * a real "cancel anytime" promise needs a real way to do it, including for
 * someone who lost their session on a new device.
 *
 * Always returns the same generic message regardless of whether the email
 * matched anything or had anything to cancel — same anti-enumeration
 * pattern as restore-access.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`billing-cancel:${getClientIp(req)}`, 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  if (!razorpay) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  const bodyEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  // Prefer an active session if present so a logged-in visitor doesn't have
  // to retype their email; fall back to the email they typed otherwise.
  const sessionSubscriber = await getCurrentSubscriber()
  const email = sessionSubscriber?.email ?? bodyEmail

  if (!sessionSubscriber && !isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const subscriber = sessionSubscriber ?? await prisma.subscriber.findUnique({ where: { email } })

  if (subscriber?.paymentSubscriptionId) {
    try {
      await razorpay.subscriptions.cancel(subscriber.paymentSubscriptionId, false)
    } catch (err) {
      // Razorpay returns 400 if it's already cancelled/expired — treat that as done, not an error.
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode !== 400) {
        console.error(`[billing cancel] Razorpay cancel failed for subscriber=${subscriber.id}:`, err)
        return NextResponse.json({ error: 'Could not cancel right now — please try again in a moment.' }, { status: 502 })
      }
    }

    await prisma.subscriber.update({
      where: { id: subscriber.id },
      data: { plan: 'free', subscriptionStatus: 'cancelled' },
    })
  }

  return NextResponse.json({ ok: true, message: "If that email has an active subscription, it's been cancelled." })
}
