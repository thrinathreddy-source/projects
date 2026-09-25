import { describe, it, expect } from 'vitest'
import { isEligibleJobPosting, isNonJobListing } from './jobPosting'

const listing = (over: Partial<Parameters<typeof isEligibleJobPosting>[0]> = {}) => ({
  title: 'Software Engineer',
  tags: 'machine learning/ai,web',
  org: 'Acme',
  location: 'Bengaluru',
  country: 'India',
  ...over,
})

describe('isEligibleJobPosting', () => {
  it('accepts an ordinary job with an org and a location', () => {
    expect(isEligibleJobPosting(listing())).toBe(true)
  })

  it('still requires an org and some location signal', () => {
    expect(isEligibleJobPosting(listing({ org: null }))).toBe(false)
    expect(isEligibleJobPosting(listing({ location: null, country: '' }))).toBe(false)
    expect(isEligibleJobPosting(listing({ location: null, country: 'India' }))).toBe(true)
  })

  it('still honours the tag screen', () => {
    expect(isEligibleJobPosting(listing({ tags: 'scholarship,education' }))).toBe(false)
  })

  describe('titles the tag screen never caught', () => {
    // The regression this exists for. Tags on this board are topical and never
    // contain these words, so every one of these was published to Google as a
    // job opening with a hiringOrganization.
    const realExamples = [
      'Built for NYC: AI Hackathon at NYPL',
      'INNOVIK 6.0 – International Hackathon 2026 | Indore Edition',
      'Inspire Hackathon',
      'Disney Streaming NYC Intern Hackathon ‘26',
      'AWS Trainium Frontier Competition',
      'Substance Use/Substance Use Disorder Dissertation Research Award',
    ]
    for (const title of realExamples) {
      it(`rejects ${JSON.stringify(title.slice(0, 44))}`, () => {
        expect(isEligibleJobPosting(listing({ title }))).toBe(false)
      })
    }

    it('rejects fellowships, scholarships and grants by title', () => {
      for (const title of [
        'NSF Graduate Research Fellowship',
        'Obama Foundation Voyager Scholarship',
        'Microsoft AI for Accessibility Grant',
        'Simons Dissertation Fellowship',
      ]) {
        expect(isEligibleJobPosting(listing({ title }))).toBe(false)
      }
    })
  })

  describe('real jobs whose titles happen to contain those words', () => {
    // The failure mode the fix must not introduce: these are salaried roles.
    it('keeps roles where the word is a modifier, not the subject', () => {
      for (const title of [
        'Grants Manager',
        'Grant Writer',
        'Fellowship Program Coordinator',
        'Awards Program Officer',
        'Scholarship Administrator',
        'Competition Analyst',
        'Senior Grants Accountant',
      ]) {
        expect(isEligibleJobPosting(listing({ title }))).toBe(true)
      }
    })
  })

  it('matches on whole words only', () => {
    // "Grantham" and "Awarding" are not "grant" and "award".
    expect(isEligibleJobPosting(listing({ title: 'Grantham Research Assistant' }))).toBe(true)
    expect(isEligibleJobPosting(listing({ title: 'Contested Territory Reporter' }))).toBe(true)
  })

  it('handles the plural form', () => {
    expect(isEligibleJobPosting(listing({ title: 'UCLA Graduate Fellowships' }))).toBe(false)
    expect(isEligibleJobPosting(listing({ title: 'Rhodes Scholarships 2026' }))).toBe(false)
  })
})

describe('isNonJobListing', () => {
  const kind = (title: string, tags = 'machine learning/ai,web') => ({ title, tags })

  it('is true for the listing types that publish a closing date', () => {
    expect(isNonJobListing(kind('Inspire Hackathon'))).toBe(true)
    expect(isNonJobListing(kind('Rhodes Scholarship'))).toBe(true)
    expect(isNonJobListing(kind('Guggenheim Fellowship'))).toBe(true)
    expect(isNonJobListing(kind('NPR Tiny Desk Contest'))).toBe(true)
  })

  it('is false for ordinary roles, including ones named after a category', () => {
    expect(isNonJobListing(kind('Software Engineer'))).toBe(false)
    expect(isNonJobListing(kind('Grants Manager'))).toBe(false)
    expect(isNonJobListing(kind('Fellowship Program Coordinator'))).toBe(false)
    expect(isNonJobListing(kind('Awards Program Officer'))).toBe(false)
  })

  it('still reads the tags when the title says nothing', () => {
    expect(isNonJobListing(kind('Summer Programme 2026', 'scholarship,education'))).toBe(true)
  })

  it('matches whole words only', () => {
    expect(isNonJobListing(kind('Grantham Institute Research Assistant'))).toBe(false)
  })

  /**
   * The invariant the link-health deadline gate depends on. Those two features
   * are the same question asked from opposite sides, and they drifted once
   * already — the deadline gate kept scanning tags after this one learned to
   * read titles, so it stopped firing on exactly the listings that carry a
   * deadline in prose.
   */
  it('is the exact complement of JobPosting eligibility, given org and location', () => {
    const titles = [
      'Software Engineer', 'Grants Manager', 'Inspire Hackathon',
      'Rhodes Scholarship', 'Awards Program Officer', 'AWS Trainium Frontier Competition',
    ]
    for (const title of titles) {
      const opp = { title, tags: 'web', org: 'Acme', location: 'Bengaluru', country: 'India' }
      expect(isEligibleJobPosting(opp)).toBe(!isNonJobListing(opp))
    }
  })
})
