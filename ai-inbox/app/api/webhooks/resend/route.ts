import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getResend } from '@/lib/email'

/**
 * POST /api/webhooks/resend — Resend's own delivery-event webhook (bounce,
 * complaint, delivered, opened, clicked). Configure this URL in the Resend
 * dashboard under Webhooks, then set RESEND_WEBHOOK_SECRET to the signing
 * secret it gives you — until that env var is set this route 503s, same
 * "no-op until configured" pattern as every other integration here.
 *
 * Bounces and complaints auto-suppress the subscriber (Subscriber.
 * emailSuppressedReason) — a real deliverability signal, kept separate
 * from a voluntary unsubscribedFromDigest so an admin can tell the two
 * apart. Resend also maintains its own suppression list server-side and
 * won't retry a hard-bounced address on its own; this is our own copy so
 * it's visible in this app's data, not just Resend's dashboard.
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook is not set up yet.' }, { status: 503 })
  }

  const payload = await req.text()
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers.' }, { status: 400 })
  }

  let event
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  const emailId = 'data' in event && 'email_id' in event.data ? event.data.email_id : null
  if (!emailId) return NextResponse.json({ ok: true })

  const statusByType: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
  }
  const status = statusByType[event.type]
  if (!status) return NextResponse.json({ ok: true }) // event type we don't track (contact.*, domain.*, ...)

  const log = await prisma.digestEmailLog.findUnique({ where: { resendId: emailId } })
  if (!log) return NextResponse.json({ ok: true }) // not one of ours (e.g. a welcome/verification email)

  await prisma.digestEmailLog.update({ where: { id: log.id }, data: { status } })

  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    await prisma.subscriber.update({
      where: { id: log.subscriberId },
      data: { emailSuppressedReason: event.type === 'email.bounced' ? 'bounced' : 'complained' },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true })
}
