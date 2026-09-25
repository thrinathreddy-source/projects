import { describe, expect, it } from 'vitest'
import { extractDeadline, resolveDeadline } from './deadline'

const NOW = new Date('2026-08-13T00:00:00Z')
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

describe('extractDeadline', () => {
  it('reads the common phrasings', () => {
    expect(iso(extractDeadline('Applications close on 15 March 2027.', NOW))).toBe('2027-03-15')
    expect(iso(extractDeadline('Application deadline: March 15, 2027', NOW))).toBe('2027-03-15')
    expect(iso(extractDeadline('Apply by 1st December 2026.', NOW))).toBe('2026-12-01')
    expect(iso(extractDeadline('Deadline is 2027-01-09 for all applicants.', NOW))).toBe('2027-01-09')
    expect(iso(extractDeadline('Last date to apply — 30 Sept 2026', NOW))).toBe('2026-09-30')
  })

  it('matches a cue split across a line break', () => {
    expect(iso(extractDeadline('Application\n  deadline:\n  4 April 2027', NOW))).toBe('2027-04-04')
  })

  // The whole reason this isn't a bare-date scan. Postings are full of dates
  // that are not deadlines.
  it('ignores dates that are not deadlines', () => {
    expect(extractDeadline('The programme starts on 3 September 2027.', NOW)).toBeNull()
    expect(extractDeadline('Posted 12 August 2026. Great role.', NOW)).toBeNull()
    expect(extractDeadline('Founded in 1998, we hire year-round.', NOW)).toBeNull()
    expect(extractDeadline('Cohort runs 5 May 2027 to 5 August 2027.', NOW)).toBeNull()
  })

  it('refuses ambiguous numeric dates rather than guessing a locale', () => {
    expect(extractDeadline('Apply by 03/11/2027.', NOW)).toBeNull()
  })

  // A past validThrough removes a listing from Google Jobs outright, so a
  // stale date in scraped prose must never be written.
  it('never returns a deadline that has already passed', () => {
    expect(extractDeadline('Applications close on 15 March 2020.', NOW)).toBeNull()
    expect(extractDeadline('Deadline: 12 August 2026', NOW)).toBeNull()
  })

  it('rejects implausibly distant and impossible dates', () => {
    expect(extractDeadline('Apply by 1 January 2099.', NOW)).toBeNull()
    expect(extractDeadline('Deadline: 31 February 2027', NOW)).toBeNull()
  })

  it('treats the deadline as end of the stated day', () => {
    const d = extractDeadline('Apply by 20 August 2026', NOW)!
    expect(d.getUTCHours()).toBe(23)
    expect(d.getUTCDate()).toBe(20)
  })

  it('handles empty input', () => {
    expect(extractDeadline(null, NOW)).toBeNull()
    expect(extractDeadline('', NOW)).toBeNull()
  })
})

describe('resolveDeadline', () => {
  it('prefers a source-provided hint over the description text', () => {
    const d = resolveDeadline(
      { deadlineHint: '2027-05-05T00:00:00Z', description: 'Applications close on 15 March 2027.' },
      NOW,
    )
    expect(iso(d)).toBe('2027-05-05')
  })

  it('falls back to the description when there is no hint', () => {
    expect(iso(resolveDeadline({ description: 'Deadline: 15 March 2027' }, NOW))).toBe('2027-03-15')
  })

  it('applies the same staleness guard to a source-provided hint', () => {
    const d = resolveDeadline(
      { deadlineHint: '2020-01-01T00:00:00Z', description: 'Applications close on 15 March 2027.' },
      NOW,
    )
    // Hint rejected as stale, so it falls through to the text.
    expect(iso(d)).toBe('2027-03-15')
  })

  it('returns null when neither source has one', () => {
    expect(resolveDeadline({ description: 'A great role on a great team.' }, NOW)).toBeNull()
  })
})
