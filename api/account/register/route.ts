import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/authSupabase'
import { linkSubscriberToAuthUser } from '@/lib/subscriberAuth'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'

/* Simple email shape check — not a full RFC 5322 parser, but stops garbage */
function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/* Password strength: min 8 chars, at least 1 letter + 1 number */
function isStrongPassword(s: string): boolean {
  return s.length >= 8 && /[a-zA-Z]/.test(s) && /\d/.test(s)
}

/**
 * POST /api/account/register — shared identity signup, used by the
 * oppidx-side /account page. Creates a Supabase Auth identity only (no
 * matching demographic data — that only happens if this person later goes
 * through the matching interview). Uses the same admin.createUser(...,
 * email_confirm: true) pattern the matching registration already uses, so
 * a shared-login account and a matching-native account are indistinguishable
 * — same auto-confirmed shape, same underlying project.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`account-register:${getClientIp(req)}`, 60 * 60_000, 5)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Account creation is not configured.' }, { status: 503 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { email, password } = body as Record<string, unknown>

  if (typeof email !== 'string' || !isPlausibleEmail(email.trim())) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (typeof password !== 'string' || !isStrongPassword(password)) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters and include a letter and a number.' },
      { status: 400 },
    )
  }

  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  })

  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes('already') || error?.status === 422) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try logging in instead.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }

  await linkSubscriberToAuthUser(data.user.id, normalizedEmail)

  return NextResponse.json({ ok: true })
}
