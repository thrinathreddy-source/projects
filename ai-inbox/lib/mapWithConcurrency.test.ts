import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './mapWithConcurrency'

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 10, 20, 0, 15]
    const out = await mapWithConcurrency(delays, 3, async ms => {
      await new Promise(r => setTimeout(r, ms))
      return ms
    })
    expect(out).toEqual(delays)
  })

  it('never runs more than `limit` calls at once', async () => {
    let inFlight = 0
    let maxSeen = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async n => {
      inFlight++
      maxSeen = Math.max(maxSeen, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return n
    })
    expect(maxSeen).toBeLessThanOrEqual(3)
    // The real point of this over a serial loop: with 8 items at 5ms each
    // and a limit of 3, wall time is roughly ceil(8/3) batches, not 8 — this
    // is what actually keeps a route under its wall-clock ceiling.
    expect(maxSeen).toBeGreaterThan(1)
  })

  it('is a no-op on an empty list', async () => {
    expect(await mapWithConcurrency([], 5, async (n: never) => n)).toEqual([])
  })

  it('works when limit exceeds the item count', async () => {
    expect(await mapWithConcurrency([1, 2], 10, async n => n * 2)).toEqual([2, 4])
  })

  it('propagates a rejection from any call', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async n => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })
})
