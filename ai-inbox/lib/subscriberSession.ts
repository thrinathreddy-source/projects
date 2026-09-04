import { createHmac } from 'crypto'
import { cookies }    from 'next/headers'
import { prisma }     from '@/lib/db'
import { isPaidSubscriber } from '@/lib/billing/entitlements'
import { getSessionSecret } from '@/lib/sessionSecret'
import { secureCompare }    from '@/lib/secureCompare'

/**
 * Lightweight, zero-cost subscriber recognition — separate from the admin
 * session in lib/session.ts (different cookie, different payload: a
 * Subscriber id, not a User id).
 *
 * Deliberately NOT identity-verified (no magic link, no password): anyone
 * who knows a subscriber's exact email can claim this cookie for them via
 * /api/billing/restore-access. That's an accepted tradeoff for shipping
 * this for free — the only thing it unlocks is seeing opportunities
 * earlier, never money or personal data, and every real check re-reads
 * `plan`/`subscriptionStatus` from the DB (only the Razorpay webhook can
 * ever set those) rather than trusting the cookie's claim by itself.
 */

/* Signed with the same secret as the admin session (lib/sessionSecret.ts),
   which refuses to hand back the dev fallback in production. This module
   used to read `process.env.SESSION_SECRET ?? 'dev_fallback_secret'` at
   import time, which meant a deploy that forgot to set SESSION_SECRET
   silently signed every subscriber cookie with a string that is sitting in
   this repo's git history — anyone could then mint a cookie for any
   subscriber id and be recognised as them. Resolved per call, not at module
   load, so the throw surfaces on the request that needs it rather than
   crashing the whole server at boot. */
const COOKIE  = 'oppidx_subscriber'
const MAX_AGE = 60 * 60 * 24 * 90 // 90 days

function sign(subscriberId: string, ts: number): string {
  const payload = `${subscriberId}.${ts}`
  const sig     = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 3) return null
  const sig     = parts.pop()!
  const payload = parts.join('.')
  const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
  if (!secureCompare(sig, expected)) return null
  const [subscriberId, ts] = payload.split('.')
  const issuedAt = parseInt(ts)
  // NaN comparisons are always false, so an unparseable timestamp used to
  // sail through the expiry check as "not expired" rather than being rejected.
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE * 1000) return null
  return subscriberId
}

export async function createSubscriberSession(subscriberId: string) {
  const token = sign(subscriberId, Date.now())
  const cookieStore = await cookies()
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   MAX_AGE,
  })
}

export async function destroySubscriberSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE)
}

/** Returns the subscriber for the current request if they're a *paying*
 * subscriber, else null. Always re-checks plan/subscriptionStatus in the
 * DB — the cookie only claims an identity, it never grants paid status. */
export async function getCurrentPaidSubscriber() {
  const subscriber = await getCurrentSubscriber()
  if (!subscriber || !isPaidSubscriber(subscriber)) return null
  return subscriber
}

/** Returns the subscriber for the current request regardless of paid status
 * — free and paid alike. Used for low-stakes, non-monetary features (saved
 * opportunities) that don't need the paid check, per the same tradeoff
 * already accepted for browsing access: identity, not payment, is what this
 * cookie ever claims. */
export async function getCurrentSubscriber() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null

  const subscriberId = verify(token)
  if (!subscriberId) return null

  return prisma.subscriber.findUnique({ where: { id: subscriberId } })
}
