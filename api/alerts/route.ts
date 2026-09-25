import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { getCurrentSubscriber, createSubscriberSession } from '@/lib/subscriberSession'
import { generateReferralCode, REFERRALS_ENABLED } from '@/lib/referral'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { resolveCollectionDef } from '@/lib/collections'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/** GET /api/alerts — which collections this visitor follows. Empty, not an
 * error, when they have no session yet. */
export async function GET() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ slugs: [] })

  const alerts = await prisma.collectionAlert.findMany({
    where: { subscriberId: subscriber.id },
    select: { collectionSlug: true },
  })
  return NextResponse.json({ slugs: alerts.map(a => a.collectionSlug) })
}

/**
 * POST /api/alerts — follow a collection.
 *
 * Same lightweight, no-password identity as saving: if there's no session
 * yet an email creates one on the spot. Deliberately does NOT require a
 * push subscription — following is a statement of interest that outlives
 * any one browser, and a person who later grants notification permission
 * (or opens the weekly email) should already have their interests on file
 * rather than being asked to re-declare them.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`alert-write:${getClientIp(req)}`, 60_000, 30)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const collectionSlug = typeof body?.collectionSlug === 'string' ? body.collectionSlug.trim() : ''
  if (!collectionSlug) return NextResponse.json({ error: 'collectionSlug is required.' }, { status: 400 })

  // Validated against the real collection definitions, so the table can
  // never accumulate rows for slugs that don't exist — those would be
  // invisible dead subscriptions that silently never fire.
  const def = await resolveCollectionDef(collectionSlug)
  if (!def) return NextResponse.json({ error: 'Unknown collection.' }, { status: 404 })

  let subscriber = await getCurrentSubscriber()

  if (!subscriber) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!isPlausibleEmail(email)) {
      return NextResponse.json({ error: 'needsEmail' }, { status: 401 })
    }
    const referredBy = REFERRALS_ENABLED && typeof body?.ref === 'string' && body.ref.trim()
      ? body.ref.trim().toUpperCase()
      : null
    try {
      subscriber = await prisma.subscriber.create({
        data: { email, referralCode: REFERRALS_ENABLED ? generateReferralCode() : null, referredBy },
      })
    } catch (e) {
      if (!isUniqueConstraintError(e)) throw e
      subscriber = await prisma.subscriber.findUniqueOrThrow({ where: { email } })
    }
    await createSubscriberSession(subscriber.id)
  }

  await prisma.collectionAlert.upsert({
    where: { subscriberId_collectionSlug: { subscriberId: subscriber.id, collectionSlug } },
    create: { subscriberId: subscriber.id, collectionSlug },
    update: {},
  })

  return NextResponse.json({ ok: true })
}

/** DELETE /api/alerts — unfollow. No-op if it wasn't followed. */
export async function DELETE(req: NextRequest) {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ error: 'No active session.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const collectionSlug = typeof body?.collectionSlug === 'string' ? body.collectionSlug.trim() : ''
  if (!collectionSlug) return NextResponse.json({ error: 'collectionSlug is required.' }, { status: 400 })

  await prisma.collectionAlert.deleteMany({
    where: { subscriberId: subscriber.id, collectionSlug },
  })

  return NextResponse.json({ ok: true })
}
