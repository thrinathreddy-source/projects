import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { getCurrentSubscriber } from '@/lib/subscriberSession'
import { isPaidSubscriber } from '@/lib/billing/entitlements'
import { generateReferralCode, REFERRALS_ENABLED } from '@/lib/referral'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

async function shape(subscriber: {
  id: string; plan: string; subscriptionStatus: string | null; currentPeriodEnd: Date | null; email: string
  institutionEmail?: string | null; institutionVerified?: boolean; referralCode?: string | null
  unsubscribedFromDigest?: boolean
}) {
  let referralCode = subscriber.referralCode ?? null
  let referralCount = 0

  if (REFERRALS_ENABLED) {
    // Backfill for subscribers created before referrals were switched on —
    // retried on collision since referralCode is unique.
    if (!referralCode) {
      for (let attempt = 0; attempt < 5 && !referralCode; attempt++) {
        try {
          const code = generateReferralCode()
          await prisma.subscriber.update({ where: { id: subscriber.id }, data: { referralCode: code } })
          referralCode = code
        } catch (e) {
          if (!isUniqueConstraintError(e)) throw e
        }
      }
    }
    if (referralCode) {
      referralCount = await prisma.subscriber.count({ where: { referredBy: referralCode } })
    }
  }

  return {
    found: true,
    email: subscriber.email,
    isPaid: isPaidSubscriber(subscriber),
    plan: subscriber.plan,
    subscriptionStatus: subscriber.subscriptionStatus,
    currentPeriodEnd: subscriber.currentPeriodEnd,
    institutionEmail: subscriber.institutionEmail ?? null,
    institutionVerified: subscriber.institutionVerified ?? false,
    referralCode,
    referralCount,
    subscribedToDigest: !(subscriber.unsubscribedFromDigest ?? false),
  }
}

/** GET /api/account/status — status for the current session, if any. */
export async function GET() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ found: false })
  return NextResponse.json(await shape(subscriber))
}

/**
 * POST /api/account/status — status lookup by email, for a visitor with no
 * active session (new device, cleared cookies). Same "knows the email"
 * identity model as restore-access — this is read-only and strictly less
 * powerful than restore-access already is, so it doesn't raise the bar.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`account-status:${getClientIp(req)}`, 60_000, 10)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const subscriber = await prisma.subscriber.findUnique({ where: { email } })
  if (!subscriber) return NextResponse.json({ found: false })

  return NextResponse.json(await shape(subscriber))
}
