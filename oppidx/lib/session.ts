import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies }                                                from 'next/headers'
import { getSessionSecret }                                       from './sessionSecret'
import { secureCompare }                                          from './secureCompare'

const COOKIE   = 'oppidx_session'
const MAX_AGE  = 60 * 60 * 24 * 30 // 30 days

/* ── Password hashing ───────────────────────────────────────── */
export function hashPassword(password: string): string {
  const salt   = randomBytes(16).toString('hex')
  const hashed = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hashed}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hashed] = stored.split(':')
    const attempt = scryptSync(password, salt, 64)
    return timingSafeEqual(Buffer.from(hashed, 'hex'), attempt)
  } catch {
    return false
  }
}

/* ── Session token: <userId>.<timestamp>.<hmac> ─────────────── */
function sign(userId: string, ts: number): string {
  const payload = `${userId}.${ts}`
  const sig     = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
  return `${payload}.${sig}`
}

function verify(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 3) return null
  const sig     = parts.pop()!
  const payload = parts.join('.')
  const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
  // Constant-time: `!==` returns as soon as two hex digits differ, which
  // makes response time a measure of how many leading bytes of a guessed
  // signature were right — the admin session is the last cookie that should
  // be brute-forceable a byte at a time.
  if (!secureCompare(sig, expected)) return null
  const [userId, ts] = payload.split('.')
  const issuedAt = parseInt(ts)
  // A non-numeric timestamp makes the subtraction NaN, and every NaN
  // comparison is false — so a malformed token used to read as *un*expired.
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE * 1000) return null
  return userId
}

/* ── Cookie helpers ─────────────────────────────────────────── */
export async function createSession(userId: string) {
  const token      = sign(userId, Date.now())
  const cookieStore = await cookies()
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',   // 'lax' allowed cross-site top-level navigations; 'strict' does not
    path:     '/',
    maxAge:   MAX_AGE,
  })
}

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies()
  const token       = cookieStore.get(COOKIE)?.value
  if (!token) return null
  return verify(token)
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE)
}
