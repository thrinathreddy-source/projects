import { describe, it, expect } from 'vitest'
import { isTursoQuotaBlocked } from './tursoQuotaBlocked'

describe('isTursoQuotaBlocked', () => {
  it('matches the real error, reproduced live against production', () => {
    // Verbatim shape captured from `prisma.resource.findMany()` after Turso's
    // free-tier quota hit 100% — the actual condition this exists to detect,
    // not a guessed one.
    const real = {
      name: 'PrismaClientKnownRequestError',
      code: 'BLOCKED',
      clientVersion: '5.22.0',
      meta: { modelName: 'Resource' },
      message:
        'Invalid `prisma.resource.findMany()` invocation:\n\n\n' +
        'BLOCKED: Operation was blocked: SQL read operations are forbidden ' +
        '(reads are blocked, do you need to upgrade your plan?)',
    }
    expect(isTursoQuotaBlocked(real)).toBe(true)
  })

  it('matches on code alone, in case the message ever changes', () => {
    expect(isTursoQuotaBlocked({ code: 'BLOCKED', message: 'anything' })).toBe(true)
  })

  it('matches on message text, in case the libsql adapter passes an error through unnormalized', () => {
    // Same reasoning as lib/isUniqueConstraintError.ts: the libsql adapter
    // doesn't always hand back a code, so the message is the fallback, not
    // an afterthought.
    expect(isTursoQuotaBlocked({ message: 'SQL read operations are forbidden right now' })).toBe(true)
    expect(isTursoQuotaBlocked({ message: 'SQL write operations are forbidden right now' })).toBe(true)
    expect(isTursoQuotaBlocked({ message: 'Operation was blocked: do you need to upgrade your plan?' })).toBe(true)
  })

  it('is false for an unrelated error', () => {
    expect(isTursoQuotaBlocked(new Error('connect ECONNREFUSED'))).toBe(false)
    expect(isTursoQuotaBlocked({ code: 'P2002', message: 'Unique constraint failed' })).toBe(false)
    expect(isTursoQuotaBlocked(new TypeError('cannot read property of undefined'))).toBe(false)
  })

  it('is false for null, undefined, and non-object values', () => {
    expect(isTursoQuotaBlocked(null)).toBe(false)
    expect(isTursoQuotaBlocked(undefined)).toBe(false)
    expect(isTursoQuotaBlocked('a string')).toBe(false)
    expect(isTursoQuotaBlocked(42)).toBe(false)
  })
})
