/**
 * In-memory sliding-window rate limiter.
 * For multi-instance / production, swap the Map for a Redis store.
 */

interface Entry {
  hits:        number
  windowStart: number
  lockedUntil: number
}

const store = new Map<string, Entry>()

// Clean stale entries every 15 min to prevent memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, e] of store) {
      if (now > e.lockedUntil && now - e.windowStart > 60 * 60_000) store.delete(k)
    }
  }, 15 * 60_000)
}

export interface RateLimitResult {
  ok:          boolean
  retryAfter?: number   // seconds until next attempt allowed
}

/**
 * @param key        Unique key — e.g. `login:192.0.2.1`
 * @param windowMs   Sliding window in milliseconds
 * @param max        Max hits allowed inside the window
 * @param lockMs     How long to lock after exceeding max (default = windowMs)
 */
export function rateLimit(
  key: string,
  windowMs: number,
  max: number,
  lockMs = windowMs,
): RateLimitResult {
  const now = Date.now()
  let e = store.get(key)

  // Locked?
  if (e && now < e.lockedUntil) {
    return { ok: false, retryAfter: Math.ceil((e.lockedUntil - now) / 1000) }
  }

  // New window?
  if (!e || now - e.windowStart > windowMs) {
    e = { hits: 1, windowStart: now, lockedUntil: 0 }
    store.set(key, e)
    return { ok: true }
  }

  e.hits++
  if (e.hits > max) {
    e.lockedUntil = now + lockMs
    return { ok: false, retryAfter: Math.ceil(lockMs / 1000) }
  }

  return { ok: true }
}

/** Reset all hits for a key (call after successful login) */
export function resetLimit(key: string) {
  store.delete(key)
}
