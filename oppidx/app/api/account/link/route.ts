import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/authSupabase'
import { linkSubscriberToAuthUser } from '@/lib/subscriberAuth'
import { rateLimit } from '@/lib/rateLimit'

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * POST /api/account/link — called right after a client-side
 * supabase.auth.signInWithPassword() succeeds (login, not signup), to mint
 * oppidx's own Subscriber cookie for an already-existing Supabase identity.
 * Reads the access token from the Authorization header rather than trusting
 * anything the client claims about who it is.
 */
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 })
  }

  // Every call round-trips to Supabase Auth to verify the token — rate
  // limit so a stream of garbage bearer tokens can't be used to hammer it.
  const rl = rateLimit(`account-link:${ip(req)}`, 15 * 60_000, 20, 30 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user?.email) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  }

  await linkSubscriberToAuthUser(data.user.id, data.user.email.toLowerCase())

  return NextResponse.json({ ok: true })
}
