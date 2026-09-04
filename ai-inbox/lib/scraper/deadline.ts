/**
 * Application deadlines — read from what a listing actually says, never guessed.
 *
 * This feeds JobPosting's `validThrough`, which is the property Google uses to
 * expire a posting from the Jobs experience. That makes it unusually
 * dangerous to get wrong in one specific direction: a `validThrough` in the
 * past removes the listing from Google Jobs immediately, and a wrong-but-
 * future one keeps a dead posting alive. So everything here is built to return
 * null unless the text is unambiguous.
 *
 * Partial coverage is fine, and worth saying plainly because it looks
 * inconsistent: `validThrough` is a *recommended* property, not a required
 * one, and Google evaluates structured data per page. A listing that carries a
 * real deadline gets the benefit; one that doesn't is treated exactly as it is
 * today. There is no penalty for a site where some pages have it and others
 * don't — the penalty is for pages that state something untrue. Hence: extract
 * only what's explicitly written, and omit everywhere else.
 *
 * Two ways a deadline can arrive:
 *   - `deadlineHint` on RawListing, for any future source that discloses one
 *     as structured data. Always preferred; no parsing guesswork involved.
 *   - Extracted from the listing's own description text, below. Scholarship,
 *     fellowship and grant postings very often write the deadline in prose
 *     ("Applications close on 15 March 2026") even though no feed exposes it
 *     as a field.
 */

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
}

const MONTH_NAMES = Object.keys(MONTHS).join('|')

/**
 * Only phrasings that explicitly mean "applications shut on this date".
 *
 * Deliberately NOT matching a bare date anywhere in the text — postings are
 * full of dates that are not deadlines (start dates, cohort dates, "posted
 * on", event dates, founding years). A bare-date heuristic was the obvious
 * first design and would have produced confidently wrong `validThrough`
 * values, which is worse than having none.
 */
const CUE = String.raw`(?:application\s+deadline|apply\s+by|applications?\s+close[sd]?(?:\s+on)?|deadline(?:\s+for\s+applications?)?|closing\s+date|last\s+date\s+(?:to\s+apply|for\s+submission)|submit\s+by|apply\s+before)`

/** "Deadline: 15 March 2026", "apply by 15th March, 2026" */
const DAY_MONTH_YEAR = new RegExp(
  String.raw`${CUE}\s*(?:is|:|-|–|—)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})\.?,?\s+(\d{4})`,
  'i',
)

/** "Deadline: March 15, 2026", "applications close on Mar 15 2026" */
const MONTH_DAY_YEAR = new RegExp(
  String.raw`${CUE}\s*(?:is|:|-|–|—)?\s*(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`,
  'i',
)

/** "Deadline: 2026-03-15" — unambiguous ISO only. */
const ISO = new RegExp(String.raw`${CUE}\s*(?:is|:|-|–|—)?\s*(\d{4})-(\d{2})-(\d{2})`, 'i')

/**
 * Numeric slash dates ("15/03/2026") are deliberately NOT parsed. This board
 * carries listings from India, the US, the UK and the EU, which disagree on
 * whether that means 15 March or 3 November. There is no reliable way to tell
 * from the text, and picking a convention would silently produce wrong
 * deadlines for whichever half of the world got the other one.
 */

/** How far ahead a stated deadline may plausibly sit. Beyond this the match is
 * almost always something else the cue happened to precede (a programme end
 * date, a multi-year fellowship term). */
const MAX_YEARS_AHEAD = 3

function build(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  // End of the stated day, UTC: a deadline of "15 March" means applications
  // are open through the 15th, not until midnight as it begins.
  const date = new Date(Date.UTC(year, month, day, 23, 59, 59))
  // Round-trip check catches impossible dates (31 February) that Date would
  // otherwise silently roll forward into March.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null
  return date
}

/**
 * The stated application deadline, or null.
 *
 * `now` is injectable so the tests don't drift as real time passes.
 */
export function extractDeadline(text: string | null | undefined, now: Date = new Date()): Date | null {
  if (!text) return null
  // Collapse whitespace so a cue split across a line break still matches.
  const haystack = text.replace(/\s+/g, ' ')

  let parsed: Date | null = null

  const dmy = DAY_MONTH_YEAR.exec(haystack)
  if (dmy) parsed = build(Number(dmy[3]), MONTHS[dmy[2].toLowerCase()], Number(dmy[1]))

  if (!parsed) {
    const mdy = MONTH_DAY_YEAR.exec(haystack)
    if (mdy) parsed = build(Number(mdy[3]), MONTHS[mdy[1].toLowerCase()], Number(mdy[2]))
  }

  if (!parsed) {
    const iso = ISO.exec(haystack)
    if (iso) parsed = build(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }

  if (!parsed) return null

  // A deadline that has already passed is not emitted. Google treats a past
  // validThrough as "this posting is over", so writing one for a listing still
  // on the board would remove it from Jobs on the strength of a regex match
  // against scraped prose. If it really has expired, the link-health cron is
  // the thing that should retire it, on evidence from the employer's own site.
  if (parsed.getTime() <= now.getTime()) return null

  const maxAhead = new Date(now)
  maxAhead.setUTCFullYear(maxAhead.getUTCFullYear() + MAX_YEARS_AHEAD)
  if (parsed.getTime() > maxAhead.getTime()) return null

  return parsed
}

/** Resolves a deadline from the source's own structured field first, falling
 * back to the listing text. Shared by the live scraper and the backfill so the
 * two can't drift. */
export function resolveDeadline(
  input: { deadlineHint?: string | Date | null; description?: string | null; rawDescription?: string | null },
  now: Date = new Date(),
): Date | null {
  if (input.deadlineHint) {
    const hinted = input.deadlineHint instanceof Date ? input.deadlineHint : new Date(input.deadlineHint)
    // Same two guards as extracted dates — a source can disclose a stale
    // deadline just as easily as prose can.
    if (!Number.isNaN(hinted.getTime()) && hinted.getTime() > now.getTime()) {
      const maxAhead = new Date(now)
      maxAhead.setUTCFullYear(maxAhead.getUTCFullYear() + MAX_YEARS_AHEAD)
      if (hinted.getTime() <= maxAhead.getTime()) return hinted
    }
  }
  return extractDeadline(input.description ?? input.rawDescription ?? null, now)
}
