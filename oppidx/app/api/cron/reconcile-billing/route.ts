import { NextRequest, NextResponse } from 'next/server'
import { secureCompare } from "@/lib/secureCompare"
import { prisma } from '@/lib/db'
import { razorpay } from '@/lib/billing/razorpay'
import { runCronPass } from '@/lib/cronGuard'

const ACTIVE_STATUSES = new Set(['active', 'authenticated'])

/**
 * GET /api/cron/reconcile-billing — monthly safety net, not the primary
 * mechanism. The webhook (app/api/billing/webhook) is what normally keeps
 * Subscriber.plan/subscriptionStatus in sync with Razorpay in near
 * real-time. This exists only to catch drift from a webhook that never
 * arrived (an outage, a misfire) — it cross-checks every subscriber with a
 * real Razorpay subscription against Razorpay's own source of truth and
 * corrects any mismatch either direction.
 *
 * Deliberately never deletes a Subscriber row. Correcting `plan` to "free"
 * revokes paid perks from someone who's stopped paying — it does not touch
 * their saved opportunities, their ability to resubscribe later, or any
 * other data. Deleting rows here would trade one data-integrity problem for
 * a worse one (orphaned SavedOpportunity rows, lost history).
 *
 * Same shared-secret auth pattern as the scrape cron — see
 * .github/workflows/billing-reconcile-cron.yml for the schedule.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron is not set up yet.' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!razorpay) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }
  // Reassigned to a local: TS's null-narrowing on the `if (!razorpay)` check
  // above doesn't carry into the async closure below, since `razorpay` is an
  // imported module-level binding rather than a local variable.
  const client = razorpay

  return runCronPass('reconcile-billing', async () => {
    const subscribers = await prisma.subscriber.findMany({
      where: { paymentSubscriptionId: { not: null } },
    })

    let checked = 0
    let corrected = 0
    const errors: string[] = []

    for (const sub of subscribers) {
      checked++
      try {
        const remote = await client.subscriptions.fetch(sub.paymentSubscriptionId!)
        const remoteIsActive = ACTIVE_STATUSES.has(remote.status)
        const localIsActive = sub.plan === 'paid' && sub.subscriptionStatus === 'active'

        if (remoteIsActive !== localIsActive || sub.subscriptionStatus !== remote.status) {
          await prisma.subscriber.update({
            where: { id: sub.id },
            data: {
              plan: remoteIsActive ? 'paid' : 'free',
              subscriptionStatus: remote.status,
              currentPeriodEnd: remote.current_end ? new Date(remote.current_end * 1000) : sub.currentPeriodEnd,
            },
          })
          corrected++
          console.log(`[reconcile-billing] corrected subscriber=${sub.id} local=${sub.subscriptionStatus} → remote=${remote.status}`)
        }
      } catch (err) {
        const description = (err as { error?: { description?: string }; message?: string })
        errors.push(`${sub.id}: ${description?.error?.description ?? description?.message ?? 'unknown error'}`)
        console.error(`[reconcile-billing] failed to check subscriber=${sub.id}:`, err)
      }
    }

    return { checked, corrected, errors }
  })
}
