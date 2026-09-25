/** Shared eligibility gate for JobPosting markup and the Google Indexing API.
 * Google only permits Indexing API notifications for pages that actually
 * contain JobPosting structured data, so these two paths must never drift. */
export const NON_JOB_TAGS = ['scholarship', 'fellowship', 'grant', 'hackathon', 'competition', 'contest', 'award']

/**
 * Role nouns that make a category word a *modifier* rather than the subject.
 *
 * "Grants Manager", "Fellowship Coordinator" and "Awards Program Officer" are
 * real salaried jobs whose titles happen to contain a word from the list
 * above; "NSF Graduate Research Fellowship" is not. Without this, screening on
 * the title would strip valid markup off genuine openings — trading one wrong
 * answer for another.
 */
const ROLE_WORDS = [
  'manager', 'officer', 'coordinator', 'administrator', 'writer', 'analyst',
  'specialist', 'director', 'associate', 'assistant', 'lead', 'head',
  'engineer', 'developer', 'designer', 'scientist', 'researcher', 'consultant',
  'advisor', 'adviser', 'executive', 'representative', 'supervisor',
  'technician', 'accountant', 'recruiter', 'strategist', 'architect',
]

const hasWord = (haystack: string, word: string) =>
  new RegExp(`\\b${word}s?\\b`, 'i').test(haystack)

export interface JobPostingCandidate {
  title: string
  tags: string
  org: string | null
  location: string | null
  country: string
}

/** The title/tags half of the gate, on its own. */
export interface ListingKind {
  title: string
  tags: string
}

/**
 * Is this a scholarship, fellowship, grant, hackathon, competition, contest or
 * award — rather than a job opening?
 *
 * Exported because two features need this same distinction from opposite
 * sides: JobPosting eligibility below wants the listings where this is false,
 * and the link-health pass wants the ones where it is true, since those are
 * the listing types that publish an application deadline in their page text
 * (see lib/scraper/deadline.ts). Keeping one predicate is what stops the two
 * drifting — they already had, when the deadline gate was still reading tags
 * alone and this one had moved on to reading titles too.
 */
export function isNonJobListing(opp: ListingKind): boolean {
  const tags = (opp.tags ?? '').toLowerCase()
  if (NON_JOB_TAGS.some(tag => tags.includes(tag))) return true

  // Whole words, so "Grantham" and "Awarding" don't read as "grant"/"award".
  const title = opp.title ?? ''
  const titleSaysNonJob = NON_JOB_TAGS.some(word => hasWord(title, word))
  return titleSaysNonJob && !ROLE_WORDS.some(role => hasWord(title, role))
}

/**
 * Is this listing an actual job opening, and therefore allowed to carry
 * JobPosting markup?
 *
 * The tag screen alone did not work. Tags on this board are *topical* —
 * "machine learning/ai", "beginner friendly", "design", "web" — and are
 * written by the scrapers and the AI summariser, which never emit the literal
 * word "hackathon". Measured against the live board: 99.9% of listings passed
 * the gate, and every one of the 24 listings matching a search for "hackathon"
 * was being published to Google as a job opening with a hiringOrganization,
 * including "Built for NYC: AI Hackathon at NYPL" and "INNOVIK 6.0 –
 * International Hackathon 2026". The words the gate looks for live in the
 * title, which it never read.
 *
 * That is worth caring about beyond tidiness. JobPosting markup on something
 * that is not a job is a structured-data policy violation, and the penalty is
 * a manual action that removes rich results for the whole site — and rich
 * results are where this site's search traffic actually comes from: per Search
 * Console, the "Job listing" appearance drew 18 of 30 total clicks at a 2.6%
 * CTR while the site overall managed 0.66%. The same gate also decides which
 * URLs get sent to the Google Indexing API, where lib/seo/googleIndexing.ts
 * already notes that submitting a non-job "would be an API-terms violation,
 * not a harmless no-op".
 *
 * Deliberately not replaced with Event markup for the hackathons. Event
 * requires a real startDate and this board stores only an application
 * deadline, so emitting one would mean inventing the date — the same class of
 * mistake, in a new schema. It needs a start-date field first.
 */
export function isEligibleJobPosting(opp: JobPostingCandidate): boolean {
  if (!opp.org) return false
  if (!(opp.location || opp.country)) return false
  return !isNonJobListing(opp)
}
