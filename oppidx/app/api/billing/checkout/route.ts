import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { razorpay, getSubscriptionCycles } from '@/lib/billing/razorpay'
import { createSubscriberSession } from '@/lib/subscriberSession'
import { generateReferralCode, REFERRALS_ENABLED } from '@/lib/referral'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

const PLAN_IDS: Record<'monthly' | 'annual', string | undefined> = {
  monthly: process.env.RAZORPAY_PLAN_ID_MONTHLY,
  annual: process.env.RAZORPAY_PLAN_ID_ANNUAL,
}

/**
 * POST /api/billing/checkout — public. Starts a paid-subscription checkout
 * for whichever cycle ("monthly" | "annual") the pricing page's toggle sent.
 *
 * This never marks anyone as paid. It creates a Razorpay subscription and
 * records its id against the Subscriber row so the webhook (the only thing
 * allowed to flip `plan` to "paid") knows which row to update once Razorpay
 * confirms the payment actually went through.
 */
export async function POST(req: NextRequest) {
  if (!razorpay) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }

  const rl = rateLimit(`billing-checkout:${getClientIp(req)}`, 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const cycle = body?.cycle === 'monthly' ? 'monthly' : 'annual'
  const planId = PLAN_IDS[cycle]
  if (!planId) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }
  const referredBy = REFERRALS_ENABLED && typeof body?.ref === 'string' && body.ref.trim() ? body.ref.trim().toUpperCase() : null

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: getSubscriptionCycles(cycle),
      customer_notify: true,
      notify_info: { notify_email: email },
    })

    const subscriber = await prisma.subscriber.upsert({
      where: { email },
      create: {
        email,
        paymentProvider: 'razorpay',
        paymentSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        referralCode: REFERRALS_ENABLED ? generateReferralCode() : null,
        referredBy,
      },
      update: {
        paymentProvider: 'razorpay',
        paymentSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    })

    // Identify this browser as the subscriber now. This alone grants nothing —
    // every paid-feature check re-reads plan/subscriptionStatus from the DB,
    // which only the Razorpay webhook can ever set to "paid"/"active".
    await createSubscriberSession(subscriber.id)

    return NextResponse.json({ ok: true, subscriptionId: subscription.id, checkoutUrl: subscription.short_url })
  } catch (err) {
    console.error('[billing] checkout failed:', err)
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
  }
}
