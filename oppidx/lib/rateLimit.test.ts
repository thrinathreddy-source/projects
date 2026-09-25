import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rateLimit, resetLimit } from './rateLimit'

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows hits up to max within the window', () => {
    const key = 'test:within-max'
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 60_000, 3).ok).toBe(true)
    }
  })

  it('blocks the hit after max and reports a retryAfter', () => {
    const key = 'test:over-max'
    rateLimit(key, 60_000, 2)
    rateLimit(key, 60_000, 2)
    const blocked = rateLimit(key, 60_000, 2)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('stays locked out until lockMs elapses, even after the window resets', () => {
    const key = 'test:lock-duration'
    rateLimit(key, 1_000, 1, 30_000)
    rateLimit(key, 1_000, 1, 30_000) // trips the lock

    vi.advanceTimersByTime(5_000) // window would have reset, lock has not
    expect(rateLimit(key, 1_000, 1, 30_000).ok).toBe(false)

    vi.advanceTimersByTime(26_000) // now past the 30s lock
    expect(rateLimit(key, 1_000, 1, 30_000).ok).toBe(true)
  })

  it('starts a fresh window once windowMs has elapsed without tripping the lock', () => {
    const key = 'test:fresh-window'
    rateLimit(key, 1_000, 2)
    vi.advanceTimersByTime(1_001)
    expect(rateLimit(key, 1_000, 2).ok).toBe(true)
  })

  it('resetLimit clears hits so the next call starts a new window', () => {
    const key = 'test:reset'
    rateLimit(key, 60_000, 1)
    resetLimit(key)
    expect(rateLimit(key, 60_000, 1).ok).toBe(true)
  })
})
