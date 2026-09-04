import { describe, it, expect, vi, afterEach } from 'vitest'
import { alignBatchIds } from './resendBatchAlignment'

afterEach(() => vi.restoreAllMocks())

const ids = (...v: string[]) => v.map(id => ({ id }))

describe('alignBatchIds', () => {
  it('maps positionally when every recipient got an entry', () => {
    expect(alignBatchIds(3, ids('a', 'b', 'c'), [])).toEqual(['a', 'b', 'c'])
  })

  it('maps compacted successes back to their original positions', () => {
    // Recipient 1 failed, so Resend returned two ids for three recipients.
    // The regression this exists for: indexing by input position handed 'c'
    // to recipient 2 — off by one for everyone after the failure.
    expect(alignBatchIds(3, ids('a', 'c'), [1])).toEqual(['a', null, 'c'])
  })

  it('handles a failure at the start', () => {
    expect(alignBatchIds(3, ids('b', 'c'), [0])).toEqual([null, 'b', 'c'])
  })

  it('handles several failures', () => {
    expect(alignBatchIds(5, ids('a', 'd'), [1, 2, 4])).toEqual(['a', null, null, 'd', null])
  })

  it('never assigns an id to a failed recipient, even in the full-length shape', () => {
    expect(alignBatchIds(3, ids('a', 'x', 'c'), [1])).toEqual(['a', null, 'c'])
  })

  it('attaches nothing when the shape matches neither convention', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(alignBatchIds(4, ids('a'), [])).toEqual([null, null, null, null])
    expect(spy).toHaveBeenCalled()
  })

  it('handles an all-failed chunk', () => {
    expect(alignBatchIds(2, [], [0, 1])).toEqual([null, null])
  })

  it('handles an empty chunk', () => {
    expect(alignBatchIds(0, [], [])).toEqual([])
  })
})
