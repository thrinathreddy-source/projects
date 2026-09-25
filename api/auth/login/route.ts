import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { createSession, verifyPassword } from '@/lib/session'
import { rateLimit, resetLimit }     from '@/lib/rateLimit'

const MAX_BODY = 4_096  // 4 KB — login form never needs more

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  /* ── Request size guard ─────────────────────────────────────── */
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 })
  }

  /* ── Per-IP rate limit: 8 attempts / 15 min, lock 1 hour ────── */
  const clientIp = ip(req)
  const rl = rateLimit(`login:${clientIp}`, 15 * 60_000, 8, 60 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${rl.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { email, password } = body as Record<string, unknown>

    /* ── Input validation ─────────────────────────────────────── */
    if (
      typeof email    !== 'string' || email.length    < 3  || email.length    > 320 ||
      typeof password !== 'string' || password.length < 1  || password.length > 1024
    ) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 400 })
    }

    /* ── Per-account rate limit: 10 attempts / 15 min, lock 1 hr  */
    const rlAcc = rateLimit(`login:${email.toLowerCase()}`, 15 * 60_000, 10, 60 * 60_000)
    if (!rlAcc.ok) {
      return NextResponse.json(
        { error: `Account temporarily locked. Try again in ${rlAcc.retryAfter} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rlAcc.retryAfter) } },
      )
    }

    /* ── Authenticate (timing-safe — always runs scrypt, even for unknown emails) ─────── */
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    const DUMMY_HASH = `${'a'.repeat(32)}:${'b'.repeat(128)}`
    const valid = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)

    if (!user || !valid) {
      // Generic message — never reveal whether email exists or password is wrong
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
    }

    /* ── Success — clear rate-limit counters ──────────────────── */
    resetLimit(`login:${clientIp}`)
    resetLimit(`login:${email.toLowerCase()}`)

    await createSession(user.id)
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } })

  } catch {
    // Never expose internals
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
