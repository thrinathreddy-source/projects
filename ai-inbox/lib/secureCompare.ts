/**
 * Constant-time string comparison.
 *
 * Deliberately dependency-free rather than a wrapper around Node's
 * `crypto.timingSafeEqual`: proxy.ts runs on the Edge runtime, which has no
 * `node:crypto`, and the whole point of this helper is that the *same*
 * comparison is used everywhere a secret is checked. Two implementations
 * split across runtimes is how one of them quietly goes back to `===`.
 *
 * Use for anything an attacker can submit and retry against a fixed server
 * secret: session HMACs, unsubscribe tokens, `Bearer CRON_SECRET`. A plain
 * `===` bails on the first differing byte, so response time leaks how much
 * of a guess was correct — enough, over enough requests, to reconstruct a
 * signature byte by byte without ever knowing the key.
 *
 * Length is compared first and therefore not hidden. That's fine for these
 * callers (hex digests and a fixed-length header are all a known length
 * anyway) and it keeps the loop from reading past either string.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
