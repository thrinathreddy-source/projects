import type { Audience, Difficulty } from '@/types'
import type { RawListing } from './types'
import { inferGeo, extractAddressRegion } from './geo'
import { decodeEntities } from './util'

export interface NormalizedListing {
  description: string
  eligibility: string
  prepResources: string
  difficulty: Difficulty
  audience: Audience
  tags: string
  compType: string | null
  region: string
  country: string
  addressRegion: string
  employmentType: string | null
}

const HARD_HINTS = /\b(phd|senior|principal|staff|5\+ years|10\+ years|invite[- ]only)\b/i
const EASY_HINTS = /\b(intern(ship)?|entry[- ]level|junior|no experience|beginner|new grad)\b/i

function inferDifficulty(text: string, audience: Audience): Difficulty {
  if (HARD_HINTS.test(text)) return 'Hard'
  if (audience === 'FOUNDER') return 'Hard'
  if (EASY_HINTS.test(text)) return 'Easy'
  return 'Medium'
}

function inferCompType(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bunpaid\b/.test(t)) return 'Unpaid'
  if (/\bstipend\b/.test(t)) return 'Stipend'
  if (/\bequity\b/.test(t)) return 'Equity'
  if (/\b(paid|salary|compensation|\$\d)/.test(t)) return 'Paid'
  return null
}

// Google's JobPosting employmentType enum — a source's own raw term (e.g.
// Adzuna's contract_type) is tried first since it's a real, disclosed
// value; text inference is the same kind of deterministic, no-AI fallback
// inferDifficulty/inferCompType above already use, not a new category of
// guessing. Left null (omitted from JSON-LD) if nothing matches either.
const EMPLOYMENT_TYPE_HINTS: Record<string, string> = {
  full_time: 'FULL_TIME', fulltime: 'FULL_TIME', permanent: 'FULL_TIME',
  part_time: 'PART_TIME', parttime: 'PART_TIME',
  contract: 'CONTRACTOR', contractor: 'CONTRACTOR', freelance: 'CONTRACTOR',
  temporary: 'TEMPORARY', temp: 'TEMPORARY',
  internship: 'INTERN', intern: 'INTERN',
  volunteer: 'VOLUNTEER',
}

function inferEmploymentType(hint: string | undefined, text: string): string | null {
  if (hint) {
    const mapped = EMPLOYMENT_TYPE_HINTS[hint.toLowerCase().replace(/[\s-]+/g, '_')]
    if (mapped) return mapped
  }
  const t = text.toLowerCase()
  if (/\bintern(ship)?\b/.test(t)) return 'INTERN'
  if (/\bvolunteer\b/.test(t)) return 'VOLUNTEER'
  if (/\b(contract|contractor|freelance)\b/.test(t)) return 'CONTRACTOR'
  if (/\btemporary\b/.test(t)) return 'TEMPORARY'
  if (/\bpart[- ]time\b/.test(t)) return 'PART_TIME'
  if (/\bfull[- ]time\b/.test(t)) return 'FULL_TIME'
  return null
}

/** Maps a raw feed listing onto the Opportunity schema using plain rules —
 * no AI/LLM calls of any kind. Fields we can't honestly derive from the raw
 * feed (eligibility, prep resources) are left blank rather than invented. */
export function normalize(raw: RawListing): NormalizedListing {
  const text = `${raw.title} ${raw.rawDescription}`
  const geo = inferGeo(raw.location)
  return {
    description: decodeEntities(raw.rawDescription || raw.title).slice(0, 600),
    eligibility: '',
    prepResources: '',
    difficulty: inferDifficulty(text, raw.audienceHint),
    audience: raw.audienceHint,
    tags: raw.tags ?? '',
    compType: inferCompType(text),
    region: geo.region,
    country: geo.country,
    addressRegion: raw.addressRegionHint || extractAddressRegion(raw.location),
    employmentType: inferEmploymentType(raw.employmentTypeHint, text),
  }
}
