import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { generateReferralCode, REFERRALS_ENABLED } from '@/lib/referral'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { sendWelcomeEmail } from '@/lib/email'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/** POST /api/subscribe — public newsletter signup. Real count, no accounts. */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`subscribe:${getClientIp(req)}`, 60 * 60_000, 10)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const referredBy = REFERRALS_ENABLED && typeof body?.ref === 'string' && body.ref.trim() ? body.ref.trim().toUpperCase() : null

  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  try {
    await prisma.subscriber.create({
      data: { email, referralCode: REFERRALS_ENABLED ? generateReferralCode() : null, referredBy },
    })
  } catch (e) {
    if (!isUniqueConstraintError(e)) {
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }
    // already subscribed — treat as success, don't leak whether it existed, and
    // don't re-send a welcome email to someone who's already had one
    return NextResponse.json({ ok: true })
  }

  if (process.env.RESEND_API_KEY) {
    sendWelcomeEmail(email).catch(err => console.error('[subscribe] welcome email failed:', err))
  }

  return NextResponse.json({ ok: true })
}
