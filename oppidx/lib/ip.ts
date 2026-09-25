import { NextRequest } from 'next/server'

/**
 * The caller's IP, used as the key for every rate limit in the app.
 *
 * `x-real-ip` is checked first on purpose. Both headers are written by the
 * platform edge, but `x-forwarded-for` is a *list*, and reading `[0]` of it
 * takes the left-most entry — the one furthest from us and the one a client
 * can prepend to. Anything that keys a limiter off that value can be
 * defeated by sending a different fake IP on each request, which would turn
 * the admin-login limiter (lib/rateLimit.ts) into no limiter at all.
 * `x-real-ip` is single-valued and set by the edge, so it can't be extended
 * the same way; the forwarded chain stays as the fallback for environments
 * that only send that one.
 *
 * Matches getIP() in lib/platform/security.ts and proxy.ts so all three
 * limiters bucket the same request the same way.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  )
}
