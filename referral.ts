import { randomBytes } from 'crypto'

/**
 * Single toggle to mask the referral program while we're still just
 * kicking off. While false, no referral codes are generated and no `ref`
 * is captured anywhere; the schema stays in place so this can be switched
 * on later with no migration needed.
 */
export const REFERRALS_ENABLED = true

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids look-alike codes

/** Short, URL-safe referral code, e.g. "K7QM2XPA". Collisions are handled by
 * the caller retrying against Subscriber.referralCode's unique constraint. */
export function generateReferralCode(length = 8): string {
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return code
}
