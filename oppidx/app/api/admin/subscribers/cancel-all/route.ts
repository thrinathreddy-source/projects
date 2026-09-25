import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { requireAuth }  from '@/lib/auth'
import { razorpay }     from '@/lib/billing/razorpay'
import { razorpayError } from '@/lib/billing/razorpayError'

/**
 * POST /api/admin/subscribers/cancel-all — admin-only emergency kill switch:
 * cancels every currently active paid subscription immediately.
 *
 * Runs sequentially (not Promise.all) so one Razorpay failure doesn't abort
 * cancellations already in flight, and so we can report exactly which ones
 * failed.
 */
export async function POST() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!razorpay) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }

  const active = await prisma.subscriber.findMany({
    where: { plan: 'paid', paymentSubscriptionId: { not: null } },
  })

  let cancelled = 0
  const failed: { email: string; error: string }[] = []

  for (const sub of active) {
    try {
      await razorpay.subscriptions.cancel(sub.paymentSubscriptionId as string, false)
    } catch (err) {
      const { statusCode, description } = razorpayError(err)
      if (statusCode !== 400) {
        failed.push({ email: sub.email, error: description ?? 'Razorpay error' })
        continue
      }
    }
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { plan: 'free', subscriptionStatus: 'cancelled' },
    })
    cancelled++
  }

  return NextResponse.json({ ok: true, cancelled, failed, totalActive: active.length })
}
