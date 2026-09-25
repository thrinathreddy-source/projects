import { describe, it, expect } from 'vitest'
import { isPaidSubscriber } from './entitlements'

describe('isPaidSubscriber', () => {
  it('is true only for an active paid plan', () => {
    expect(isPaidSubscriber({ plan: 'paid', subscriptionStatus: 'active' })).toBe(true)
  })

  it('is false when the plan is free, regardless of status', () => {
    expect(isPaidSubscriber({ plan: 'free', subscriptionStatus: 'active' })).toBe(false)
  })

  it('is false when a paid plan has lapsed', () => {
    expect(isPaidSubscriber({ plan: 'paid', subscriptionStatus: 'cancelled' })).toBe(false)
    expect(isPaidSubscriber({ plan: 'paid', subscriptionStatus: null })).toBe(false)
  })
})
