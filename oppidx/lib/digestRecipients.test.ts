import { describe, it, expect } from 'vitest'
import { digestRecipients } from './digestRecipients'

const subs = (...ids: string[]) => ids.map(id => ({ id, email: `${id}@example.com` }))
const ids = <T extends { id: string }>(rows: T[]) => rows.map(r => r.id)

describe('digestRecipients', () => {
  it('includes everyone when nothing has been logged today', () => {
    expect(ids(digestRecipients(subs('a', 'b', 'c'), []))).toEqual(['a', 'b', 'c'])
  })

  it('skips subscribers already sent to today', () => {
    const out = digestRecipients(subs('a', 'b'), [{ subscriberId: 'a', status: 'sent' }])
    expect(ids(out)).toEqual(['b'])
  })

  it('retries a subscriber whose send failed', () => {
    // The regression this exists for: a transient Resend error logged 'failed',
    // and the old "any row means done" rule dropped them from every retry.
    const out = digestRecipients(subs('a', 'b'), [{ subscriberId: 'a', status: 'failed' }])
    expect(ids(out)).toEqual(['a', 'b'])
  })

  it('never re-sends to an address that bounced or complained', () => {
    const out = digestRecipients(subs('a', 'b', 'c'), [
      { subscriberId: 'a', status: 'bounced' },
      { subscriberId: 'b', status: 'complained' },
    ])
    expect(ids(out)).toEqual(['c'])
  })

  it('treats every delivery-progress status as settled', () => {
    const out = digestRecipients(subs('a', 'b', 'c', 'd'), [
      { subscriberId: 'a', status: 'delivered' },
      { subscriberId: 'b', status: 'opened' },
      { subscriberId: 'c', status: 'clicked' },
    ])
    expect(ids(out)).toEqual(['d'])
  })

  it('resends when a failure is the only record for that subscriber', () => {
    const out = digestRecipients(subs('a'), [{ subscriberId: 'a', status: 'failed' }])
    expect(ids(out)).toEqual(['a'])
  })
})
