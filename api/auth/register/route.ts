import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { createSession, hashPassword } from '@/lib/session'
import { rateLimit }                 from '@/lib/rateLimit'
import { isUniqueConstraintError }   from '@/lib/isUniqueConstraintError'

const MAX_BODY = 4_096

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/* Simple email shape check — not a full RFC 5322 parser, but stops garbage */
function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/* Password strength: min 8 chars, at least 1 letter + 1 number */
function isStrongPassword(s: string): boolean {
  return s.length >= 8 && /[a-zA-Z]/.test(s) && /\d/.test(s)
}

export async function POST(req: NextRequest) {
  /* ── Request size guard ─────────────────────────────────────── */
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  /* ── Per-IP rate limit: 5 registrations / hour ──────────────── */
  const clientIp = ip(req)
  const rl = rateLimit(`register:${clientIp}`, 60 * 60_000, 5, 60 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many registrations from this IP. Try again in ${rl.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { name, email, password, setupToken } = body as Record<string, unknown>

    /* ── Setup token gate ─────────────────────────────────────────
       OppIDX has exactly one admin account. Without this, anyone who
       finds /auth before the real owner could register first and lock
       them out — or a second attacker could register a rival admin
       account later. Both are closed off here: registration requires
       the server-only ADMIN_SETUP_TOKEN, and is refused outright once
       an admin already exists. ── */
    if (!process.env.ADMIN_SETUP_TOKEN) {
      return NextResponse.json({ error: 'Registration is not configured.' }, { status: 503 })
    }
    if (typeof setupToken !== 'string' || setupToken !== process.env.ADMIN_SETUP_TOKEN) {
      return NextResponse.json({ error: 'Invalid setup token.' }, { status: 403 })
    }
    if ((await prisma.user.count()) > 0) {
      return NextResponse.json({ error: 'Registration is closed — an admin account already exists.' }, { status: 403 })
    }

    /* ── Input validation ─────────────────────────────────────── */
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
      return NextResponse.json({ error: 'Please enter a valid name.' }, { status: 400 })
    }
    if (typeof email !== 'string' || !isPlausibleEmail(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (typeof password !== 'string' || !isStrongPassword(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters and include a letter and a number.' },
        { status: 400 },
      )
    }
    if (password.length > 1024) {
      return NextResponse.json({ error: 'Password is too long.' }, { status: 400 })
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
      },
    })
    await createSession(user.id)

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } })

  } catch (e) {
    // Unique constraint violation on email
    if (isUniqueConstraintError(e)) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
