/**
 * Shared by lib/session.ts (Node) and proxy.ts (Edge) — both must sign and
 * verify with the exact same secret, and neither can silently fall back to
 * a hardcoded value in production: that string is sitting in a public git
 * history, so a missing SESSION_SECRET env var would let anyone forge a
 * valid /admin session cookie. No Node-specific APIs here, so it's safe to
 * import from Edge middleware too.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set. Refusing to sign sessions with a known fallback in production.')
  }
  return 'dev_fallback_secret'
}
