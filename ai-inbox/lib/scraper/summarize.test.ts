import { describe, it, expect } from 'vitest'
import { templateOpportunitySummary } from './summarize'

describe('templateOpportunitySummary', () => {
  it('composes role, org, location, and comp type into one sentence', () => {
    expect(
      templateOpportunitySummary({
        org: 'Acme', location: 'Remote', audience: 'STUDENT',
        employmentType: 'INTERN', compType: 'PAID',
      }),
    ).toBe('Internship at Acme in Remote — paid.')
  })

  it('falls back to the audience label when employmentType is unset', () => {
    expect(
      templateOpportunitySummary({
        org: null, location: null, audience: 'FOUNDER',
        employmentType: null, compType: null,
      }),
    ).toBe('Founder opportunity.')
  })

  it('does not double up a period when org already ends in one', () => {
    expect(
      templateOpportunitySummary({
        org: 'Stripe, Inc.', location: null, audience: 'GENERAL',
        employmentType: 'FULL_TIME', compType: null,
      }),
    ).toBe('Full-time role at Stripe, Inc.')
  })

  it('does not double up a period when location already ends in one', () => {
    const summary = templateOpportunitySummary({
      org: null, location: 'Washington, D.C.', audience: 'GENERAL',
      employmentType: null, compType: null,
    })
    expect(summary?.endsWith('..')).toBe(false)
    expect(summary).toBe('Opportunity in Washington, D.C.')
  })

  it('omits clauses for fields that are null', () => {
    expect(
      templateOpportunitySummary({
        org: null, location: null, audience: 'EARLY_CAREER',
        employmentType: null, compType: null,
      }),
    ).toBe('Early-career role.')
  })
})
