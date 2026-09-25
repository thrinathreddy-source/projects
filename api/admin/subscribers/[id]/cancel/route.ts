import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { requireAuth }  from '@/lib/auth'
import { razorpay }     from '@/lib/billing/razorpay'
import { razorpayError } from '@/lib/billing/razorpayError'

/**
 * POST /api/admin/subscribers/[id]/cancel — admin-only: cancel one subscriber's
 * paid subscription immediately (not at cycle end).
 *
 * Unlike the webhook (the only path allowed to *grant* paid status), this is
 * safe to update the DB directly on success — an authenticated admin
 * downgrading someone to free is not a privilege-escalation risk.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!razorpay) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }

  const { id } = await params
  const subscriber = await prisma.subscriber.findUnique({ where: { id } })
  if (!subscriber) {
    return NextResponse.json({ error: 'Subscriber not found.' }, { status: 404 })
  }
  if (!subscriber.paymentSubscriptionId) {
    return NextResponse.json({ error: 'This subscriber has no active paid subscription.' }, { status: 400 })
  }

  try {
    await razorpay.subscriptions.cancel(subscriber.paymentSubscriptionId, false)
  } catch (err) {
    // Razorpay returns 400 if it's already cancelled/expired — treat that as success.
    const { statusCode, description } = razorpayError(err)
    const alreadyDone = statusCode === 400
    if (!alreadyDone) {
      return NextResponse.json({ error: description ?? 'Failed to cancel with Razorpay.' }, { status: 502 })
    }
  }

  const updated = await prisma.subscriber.update({
    where: { id },
    data: { plan: 'free', subscriptionStatus: 'cancelled' },
  })

  return NextResponse.json({ ok: true, subscriber: updated })
}
