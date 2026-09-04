import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { rateLimit }                 from '@/lib/rateLimit'
import { getClientIp }               from '@/lib/ip'
import { getCurrentSubscriber }      from '@/lib/subscriberSession'
import { sendInstitutionVerificationEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/siteUrl'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/**
 * POST /api/account/verify-institution — request a verification link for
 * an email address, sent to that address. Free (Resend's free tier),
 * optional (nothing else on the site checks this flag to gate access),
 * and deliberately not domain-restricted — see the model comment in
 * prisma/schema.prisma.
 */
export async function POST(req: NextRequest) {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ error: 'Log in first.' }, { status: 401 })

  const rl = rateLimit(`verify-institution:${getClientIp(req)}`, 60_000, 3)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const institutionEmail = typeof body?.institutionEmail === 'string' ? body.institutionEmail.trim().toLowerCase() : ''
  if (!isPlausibleEmail(institutionEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const token = randomBytes(24).toString('base64url')

  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data: {
      institutionEmail,
      institutionVerified: false,
      institutionVerifiedAt: null,
      institutionVerifyToken: token,
      institutionVerifyTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })

  await sendInstitutionVerificationEmail(institutionEmail, `${SITE_URL}/verify-institution/${token}`).catch(err => {
    console.error('[verify-institution] send failed:', err)
  })

  return NextResponse.json({ ok: true })
}
