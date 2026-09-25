import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { prisma } from '@/lib/db'
import { inferGeo } from '@/lib/scraper/geo'
import { fetchOgMedia } from '@/lib/ogImage'
import type { SubmissionInput } from '@/lib/submissions/validate'
import { FEATURED_DURATION_DAYS } from '@/lib/billing/razorpay'
import { newSlug } from '@/lib/slug'

const ACTIVATING_EVENTS = new Set(['subscription.activated', 'subscription.charged'])
const DEACTIVATING_EVENTS = new Set(['subscription.cancelled', 'subscription.halted', 'subscription.completed'])

/**
 * POST /api/billing/webhook — called by Razorpay's servers, not a browser.
 *
 * This is the ONLY code path allowed to mark a Subscriber as "paid", and the
 * ONLY code path allowed to turn a paid OpportunitySubmission into a real
 * (still unverified) Opportunity row. Nothing here is trusted until the
 * signature check passes: the raw body must be verified byte-for-byte
 * against X-Razorpay-Signature before it's even parsed as JSON, otherwise
 * anyone could POST a fake "payment succeeded" event and grant themselves a
 * free paid account or a free listing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 })
  }

  const signature = req.headers.get('x-razorpay-signature')
  const rawBody = await req.text()

  if (!signature || !Razorpay.validateWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  const event = JSON.parse(rawBody) as {
    event?: string
    payload?: {
      subscription?: { entity?: { id?: string; status?: string; current_end?: number } }
      payment?: { entity?: { id?: string; order_id?: string; status?: string } }
    }
  }

  // One-time "enlist your opportunity" submission fee — separate flow from
  // recurring subscriptions below, keyed by Razorpay order id instead of
  // subscription id.
  const paymentEntity = event.payload?.payment?.entity
  if (event.event === 'payment.captured' && paymentEntity?.order_id) {
    await handleSubmissionPayment(paymentEntity.order_id)
    return NextResponse.json({ ok: true })
  }

  const subscriptionEntity = event.payload?.subscription?.entity
  const subscriptionId = subscriptionEntity?.id
  if (!event.event || !subscriptionId) {
    // Not an event we care about — ack and move on.
    return NextResponse.json({ ok: true })
  }

  const data: { subscriptionStatus?: string; plan?: string; currentPeriodEnd?: Date | null } = {
    subscriptionStatus: subscriptionEntity?.status,
  }
  if (ACTIVATING_EVENTS.has(event.event)) {
    data.plan = 'paid'
    data.currentPeriodEnd = subscriptionEntity?.current_end ? new Date(subscriptionEntity.current_end * 1000) : null
  } else if (DEACTIVATING_EVENTS.has(event.event)) {
    data.plan = 'free'
  }

  try {
    const result = await prisma.subscriber.updateMany({
      where: { paymentSubscriptionId: subscriptionId },
      data,
    })
    // Razorpay's own retry/idempotency means this event may legitimately
    // arrive before the checkout route's upsert finishes writing the
    // subscription id — log it so a real drift is visible, not silent.
    if (result.count === 0) {
      console.error(`[billing webhook] no Subscriber found for subscriptionId=${subscriptionId} (event=${event.event}) — payment may not be reflected`)
    }
  } catch (err) {
    console.error(`[billing webhook] failed to update Subscriber for subscriptionId=${subscriptionId} (event=${event.event}):`, err)
    return NextResponse.json({ error: 'Internal error — will retry.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Turns a paid submission fee into a live Opportunity row. The review is
 * validateSubmission() running synchronously in the submit route, before
 * payment is even accepted — if it fails, the submitter is denied and never
 * gets to the payment step. So by the time a payment is captured here, the
 * listing already cleared its one and only review and goes straight onto
 * the board — no separate manual approval queue. Idempotent against
 * Razorpay's webhook retries: only acts if the submission is still
 * "pending" — a second `payment.captured` for the same order is a no-op.
 */
async function handleSubmissionPayment(razorpayOrderId: string) {
  const submission = await prisma.opportunitySubmission.findUnique({ where: { razorpayOrderId } })
  if (!submission || submission.status !== 'pending') return

  let input: Partial<SubmissionInput>
  try {
    input = JSON.parse(submission.payload)
  } catch (err) {
    // Retrying won't make malformed stored JSON parse, so ack and stop rather
    // than leaving Razorpay redelivering forever.
    console.error('[webhook] could not parse stored submission payload:', err)
    return
  }

  // Claim the submission before creating anything. The status check above is
  // a read, and the create() below is a network round trip to Turso, so two
  // overlapping deliveries of the same payment.captured — which is exactly
  // what Razorpay does when a slow response makes it retry — could both see
  // 'pending' and both mint an Opportunity. One payment, two live listings,
  // near-duplicates of each other: the same thing lib/scraper/dedupe.ts
  // exists to prevent, arriving through the payment path instead.
  //
  // updateMany with the status in the WHERE is a single conditional UPDATE, so
  // exactly one delivery comes back with count 1 and the loser stops here.
  const claimed = await prisma.opportunitySubmission.updateMany({
    where: { id: submission.id, status: 'pending' },
    data: { status: 'paid' },
  })
  if (claimed.count === 0) return

  const geo = inferGeo(input.location)
  const wantsFeatured = input.wantsFeatured === true

  // From here the submission is already marked paid, so a failure would leave
  // a submitter who was charged with nothing on the board and no retry coming.
  // The catch hands the claim back so Razorpay's next delivery can complete it.
  let created
  try {
    created = await prisma.opportunity.create({
      data: {
        title: (input.title ?? '').trim(),
        slug: newSlug({ title: (input.title ?? '').trim(), org: input.org?.trim() || null }),
        description: (input.description ?? '').trim(),
        url: (input.url ?? '').trim(),
        org: input.org?.trim() || null,
        audience: input.audience ?? 'GENERAL',
        eligibility: (input.eligibility ?? '').trim(),
        prepResources: (input.prepResources ?? '').trim(),
        difficulty: input.difficulty ?? 'Medium',
        tags: (input.tags ?? '').trim(),
        location: input.location?.trim() || null,
        region: geo.region,
        country: geo.country,
        compType: input.compType?.trim() || null,
        verified: true, // cleared the automated content-standards check pre-payment — straight onto the board
        featured: wantsFeatured,
        featuredUntil: wantsFeatured ? new Date(Date.now() + FEATURED_DURATION_DAYS * 24 * 60 * 60 * 1000) : null,
        source: 'user-provided',
        sourceUrl: null,
      },
    })

    await prisma.opportunitySubmission.update({
      where: { id: submission.id },
      data: { opportunityId: created.id },
    })
  } catch (err) {
    // Only release a claim that produced nothing — the opportunityId guard
    // means a row that did get its listing is never sent back round.
    await prisma.opportunitySubmission.updateMany({
      where: { id: submission.id, status: 'paid', opportunityId: null },
      data: { status: 'pending' },
    }).catch(() => null)
    console.error('[webhook] failed to create the paid listing; released for retry:', err)
    throw err // non-2xx so Razorpay redelivers
  }

  // Fire-and-forget — a real og:image is worth having, but this is a
  // payment webhook and Razorpay expects a fast response, so the fetch
  // happens after responding rather than blocking it.
  fetchOgMedia(created.url)
    .then(({ imageUrl, videoUrl }) => {
      if (imageUrl || videoUrl) {
        return prisma.opportunity.update({ where: { id: created.id }, data: { imageUrl, videoUrl } })
      }
    })
    .catch(() => {})
}
