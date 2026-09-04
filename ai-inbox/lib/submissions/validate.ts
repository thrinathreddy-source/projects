/**
 * Content rules for free public submissions ("enlist your opportunity").
 *
 * This is deliberately stricter than the admin AddForm: submissions come
 * from arbitrary third parties, not from a fixed list of pre-vetted sources
 * like the scraper, so nothing here is trusted until a human approves it in
 * the admin queue. These checks are a best-effort first filter (they reject
 * obviously non-compliant text) — they are NOT a substitute for the human
 * review, especially for judgment calls like "illegal or suggestive." No AI
 * is used to make that call either; a person makes it.
 */

export interface SubmissionInput {
  title: string
  description: string
  url: string
  org: string
  audience: string
  eligibility: string
  prepResources: string
  difficulty: string
  tags: string
  location: string
  compType: string
  submitterEmail: string
  // Not fee-tiering (submission is free) — kept as a simple category so the
  // admin review queue shows what kind of listing this is at a glance.
  listingType: string
  // Always false from the public /submit form — featuring a listing is an
  // admin-only action (see AdminPanel's sponsor/feature controls), not
  // something a submitter can request or pay for.
  wantsFeatured: boolean
}

const VALID_AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']
export const VALID_LISTING_TYPES = ['job_internship', 'scholarship_grant', 'competition'] as const
export type ListingType = typeof VALID_LISTING_TYPES[number]

// Free-text fields — everything except the dedicated `url` field. None of
// these may contain a link, an email, a handle, or a phone number: the
// application link field is the only contact surface a listing gets.
const FREE_TEXT_FIELDS: (keyof SubmissionInput)[] = [
  'title', 'description', 'org', 'eligibility', 'prepResources', 'tags', 'location', 'compType',
]

const LINK_PATTERN = /https?:\/\/|www\./i
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const HANDLE_PATTERN = /(^|\s)@[a-zA-Z0-9_]{2,}/
const CONTACT_KEYWORD_PATTERN = /\b(whatsapp|telegram|instagram|discord|snapchat|dm (me|us)|message (me|us)|text (me|us)|call (me|us)|contact (me|us) at|reach (me|us) at)\b/i

// Blunt heuristic, not a phone-number parser: a run of digits and phone-shaped
// separators (space, dash, dot, parens) with 7+ actual digits inside it.
const PHONE_CANDIDATE_PATTERN = /\+?[\d][\d\s\-().]{6,}\d/g

function containsPhoneNumber(text: string): boolean {
  const matches = text.match(PHONE_CANDIDATE_PATTERN) ?? []
  return matches.some(m => (m.match(/\d/g) ?? []).length >= 7)
}

// Application links must go straight to the organization's own site — not a
// shortener (which hides the real destination) and not a social/DM surface
// dressed up as an "apply" link.
const BLOCKED_APPLY_HOSTS = [
  'bit.ly', 'tinyurl.com', 't.co', 'rebrand.ly', 'cutt.ly', 'is.gd', 'buff.ly', 'ow.ly', 'shorturl.at',
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com',
  'wa.me', 't.me', 'discord.gg', 'discord.com', 'snapchat.com',
]

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

export function validateSubmission(input: Partial<SubmissionInput>): ValidationResult {
  const errors: string[] = []

  const title = (input.title ?? '').trim()
  const description = (input.description ?? '').trim()
  const url = (input.url ?? '').trim()
  const audience = (input.audience ?? '').trim()
  const eligibility = (input.eligibility ?? '').trim()
  const difficulty = (input.difficulty ?? 'Medium').trim()
  const submitterEmail = (input.submitterEmail ?? '').trim().toLowerCase()
  const listingType = (input.listingType ?? '').trim()

  if (!title) errors.push('Title is required.')
  if (!description || description.length < 40) errors.push('Description must be at least 40 characters — give this a real explanation, not a one-liner.')
  if (!VALID_AUDIENCES.includes(audience)) errors.push('Invalid audience.')
  if (!eligibility) errors.push('Eligibility is required — who can actually apply.')
  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) errors.push('Invalid difficulty.')
  if (!isPlausibleEmail(submitterEmail)) errors.push('A valid contact email is required (used only for payment/status — never published).')
  if (!VALID_LISTING_TYPES.includes(listingType as ListingType)) errors.push('Select what kind of opportunity this is.')

  if (!url) {
    errors.push('An application URL is required.')
  } else if (!/^https:\/\//i.test(url)) {
    errors.push('The application link must be a secure (https://) link directly to the organization\'s own page.')
  } else {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
      if (BLOCKED_APPLY_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) {
        errors.push('The application link must go straight to the organization\'s own site — not a shortener, social profile, or DM link.')
      }
    } catch {
      errors.push('The application URL is not valid.')
    }
  }

  for (const field of FREE_TEXT_FIELDS) {
    const value = (input[field] ?? '').toString()
    if (!value) continue
    if (LINK_PATTERN.test(value)) {
      errors.push(`"${field}" contains a link — the only link allowed on a listing is the application URL field.`)
    }
    if (EMAIL_PATTERN.test(value)) {
      errors.push(`"${field}" contains an email address — listings may not include any contact info other than the application link.`)
    }
    if (HANDLE_PATTERN.test(value)) {
      errors.push(`"${field}" contains an @handle — no account or social mentions are allowed.`)
    }
    if (CONTACT_KEYWORD_PATTERN.test(value)) {
      errors.push(`"${field}" references a contact channel (WhatsApp, Telegram, DMs, etc.) — the application link is the only way in.`)
    }
    if (containsPhoneNumber(value)) {
      errors.push(`"${field}" appears to contain a phone number — phone numbers are not allowed anywhere on a listing.`)
    }
  }

  return { ok: errors.length === 0, errors }
}
