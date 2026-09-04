import { createHmac } from 'crypto'
import { getSessionSecret } from '@/lib/sessionSecret'
import { secureCompare }    from '@/lib/secureCompare'

/**
 * Signs/verifies a subscriber id for the digest-unsubscribe link — same
 * HMAC pattern as lib/subscriberSession.ts, but deliberately no expiry: an
 * unsubscribe link that stops working is the one link a compliance-minded
 * email absolutely cannot let expire.
 *
 * Uses the shared getSessionSecret() rather than its own
 * `process.env.SESSION_SECRET ?? 'dev_fallback_secret'`: with the fallback,
 * a deploy missing SESSION_SECRET signed these with a value published in
 * this repo, and since the token is just `<subscriberId>.<hmac>` over an id
 * that appears in ordinary URLs, anyone could forge one and unsubscribe
 * arbitrary people from the digest. Read per call so the guard fires on the
 * request rather than at import.
 */
export function signUnsubscribeToken(subscriberId: string): string {
  const sig = createHmac('sha256', getSessionSecret()).update(subscriberId).digest('hex')
  return `${subscriberId}.${sig}`
}

export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [subscriberId, sig] = parts
  const expected = createHmac('sha256', getSessionSecret()).update(subscriberId).digest('hex')
  return secureCompare(sig, expected) ? subscriberId : null
}
