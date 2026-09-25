import { describe, expect, it } from 'vitest'
import { contentKey, urlKey } from './dedupe'

describe('urlKey', () => {
  // The exact regression this whole module exists for: two real Adzuna
  // redirect_urls captured from production, same ad, different `se=` token.
  // These produced two separate indexable pages under the old exact-string
  // check; the same ad reached 33 of them.
  it('collapses Adzuna links that differ only in the rotating se token', () => {
    const a = 'https://www.adzuna.com/land/ad/5737316718?se=Ct4qOXCR8RGExO5K9raumQ&utm_medium=api&utm_source=5c4fc3a8&v=234365F87C381232CD0004E70399CC1A4CE1AB85'
    const b = 'https://www.adzuna.com/land/ad/5737316718?se=nmEcGrOM8RGGgO_n0rmdiQ&utm_medium=api&utm_source=5c4fc3a8&v=234365F87C381232CD0004E70399CC1A4CE1AB85'
    expect(urlKey(a)).toBe(urlKey(b))
    expect(urlKey(a)).toBe('adzuna.com/land/ad/5737316718')
  })

  it('keeps posting ids that live in the query string', () => {
    const spacex = 'https://boards.greenhouse.io/spacex/jobs/8646146002?gh_jid=8646146002'
    const other = 'https://boards.greenhouse.io/spacex/jobs/8646146003?gh_jid=8646146003'
    expect(urlKey(spacex)).not.toBe(urlKey(other))
    expect(urlKey(spacex)).toContain('gh_jid=8646146002')
  })

  it('ignores host case, www, trailing slashes and param order', () => {
    expect(urlKey('https://WWW.Example.com/jobs/1/')).toBe(urlKey('https://example.com/jobs/1'))
    expect(urlKey('https://example.com/j?b=2&a=1')).toBe(urlKey('https://example.com/j?a=1&b=2'))
  })

  it('preserves path case, which some servers treat as significant', () => {
    expect(urlKey('https://example.com/Jobs/Engineer')).not.toBe(urlKey('https://example.com/jobs/engineer'))
  })

  it('still returns a stable key for an unparseable URL', () => {
    expect(urlKey('  not a url/  ')).toBe(urlKey('NOT A URL'))
  })
})

describe('contentKey', () => {
  // The counter-case: same company, same title, three cities. These are three
  // real jobs, and a title+org fingerprint would have discarded two of them.
  it('keeps one role posted in different cities apart', () => {
    const base = { title: 'Graduate Operations Supervisor (m/w/d)', org: 'teampicnic' }
    const keys = ['Kabelsketal, Saxony-Anhalt', 'Essen, North Rhine-Westphalia', 'Halle, Saxony-Anhalt']
      .map(location => contentKey({ ...base, location }))
    expect(new Set(keys).size).toBe(3)
  })

  it('matches the same posting despite punctuation and casing differences', () => {
    expect(contentKey({ title: 'Software Engineer (m/w/d)', org: 'Acme Inc.', location: 'Berlin' }))
      .toBe(contentKey({ title: 'software engineer m w d', org: 'acme inc', location: 'berlin' }))
  })

  it('returns null without an org, rather than a key that matches everything', () => {
    expect(contentKey({ title: 'Software Engineer', org: null, location: 'Berlin' })).toBeNull()
    expect(contentKey({ title: 'Software Engineer', org: '   ', location: 'Berlin' })).toBeNull()
  })

  it('distinguishes the same title at different companies', () => {
    expect(contentKey({ title: 'Software Engineer', org: 'Stripe', location: 'Remote' }))
      .not.toBe(contentKey({ title: 'Software Engineer', org: 'Twilio', location: 'Remote' }))
  })
})
