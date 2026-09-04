import { describe, it, expect, vi, afterEach } from 'vitest'
import { runCronPass } from './cronGuard'

afterEach(() => vi.restoreAllMocks())

describe('runCronPass', () => {
  it('returns the work result as-is on success', async () => {
    const res = await runCronPass('test', async () => ({ added: 3 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 3 })
  })

  it('turns a Turso quota block into a 200 skip instead of a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quotaError = { code: 'BLOCKED', message: 'SQL read operations are forbidden' }
    const res = await runCronPass('test', async () => { throw quotaError })
    // 200, not 5xx: this is the entire point — `curl -sf` in the GitHub
    // Actions workflow must see success here, or the failure email this
    // exists to stop keeps firing exactly as before.
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skipped: true, reason: 'turso-quota-blocked' })
  })

  it('still throws for a real error, unchanged from before this existed', async () => {
    // The regression this guards against in the other direction: if this
    // ever caught errors too broadly, a genuine bug would go silent instead
    // of alerting, which is worse than the noise it was built to reduce.
    await expect(
      runCronPass('test', async () => { throw new Error('unexpected crash') }),
    ).rejects.toThrow('unexpected crash')
  })

  it('still throws for a different, unrelated Prisma error code', async () => {
    await expect(
      runCronPass('test', async () => { throw { code: 'P2002', message: 'Unique constraint failed' } }),
    ).rejects.toEqual({ code: 'P2002', message: 'Unique constraint failed' })
  })
})
