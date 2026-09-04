import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { secureCompare } from './secureCompare'

describe('secureCompare', () => {
  it('accepts identical strings', () => {
    expect(secureCompare('abc123', 'abc123')).toBe(true)
    expect(secureCompare('', '')).toBe(true)
  })

  it('rejects a difference in any position, including the last byte', () => {
    // The last-byte case is the one a first-difference `!==` gets right by
    // accident; the point is that this returns the same answer either way.
    expect(secureCompare('abc123', 'xbc123')).toBe(false)
    expect(secureCompare('abc123', 'abc124')).toBe(false)
  })

  it('rejects strings of different lengths without throwing', () => {
    expect(secureCompare('abc', 'abcd')).toBe(false)
    expect(secureCompare('abcd', 'abc')).toBe(false)
    expect(secureCompare('', 'a')).toBe(false)
  })

  it('verifies a real HMAC digest end to end', () => {
    const sig = createHmac('sha256', 'secret').update('user.123').digest('hex')
    const forged = createHmac('sha256', 'wrong-secret').update('user.123').digest('hex')
    expect(secureCompare(sig, sig)).toBe(true)
    expect(secureCompare(forged, sig)).toBe(false)
  })

  it('is not fooled by type coercion of lookalike values', () => {
    expect(secureCompare('0', '')).toBe(false)
    expect(secureCompare('Bearer x', 'bearer x')).toBe(false)
  })
})
