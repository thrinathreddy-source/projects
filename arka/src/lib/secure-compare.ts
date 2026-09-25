/**
 * Constant-time string comparison.
 *
 * Ported from OppIDX, where it guards session HMACs and the cron bearer token.
 * Deliberately dependency-free rather than a wrapper around Node's
 * `crypto.timingSafeEqual`, so the same comparison can run anywhere — including
 * the Edge runtime `proxy.ts` uses, which has no `node:crypto`. Two
 * implementations split across runtimes is how one of them quietly goes back
 * to `===`.
 *
 * Use it for anything an attacker can submit and retry against a fixed server
 * secret. A plain `===` bails on the first differing character, so response
 * time leaks how much of a guess was right — enough, over enough requests, to
 * recover the secret one character at a time without ever seeing it.
 *
 * Length is compared first and is therefore not hidden. That is fine for these
 * callers — a bearer header built from a known secret has a known length — and
 * it keeps the loop from reading past the end of either string.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
