/**
 * Field rules for public resource submissions ("submit a resource").
 *
 * Mirrors lib/submissions/validate.ts's shape (free-text fields may not
 * carry a link/email/handle/phone — the `url` field is the only contact
 * surface a resource gets) but lighter, since resources aren't paid and
 * don't carry a listing-type/featured upsell. Passing these checks is
 * necessary but not sufficient — see lib/resources/verify.ts for the
 * automated checks (URL reachability, duplicates) that actually gate
 * whether a submission becomes a live Resource.
 */

export interface ResourceSubmissionInput {
  title: string
  description: string
  url: string
  category: string
  audience: string
  submitterEmail: string
}

export const VALID_AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']
// Financial/Spiritual Literacy lead the list on purpose — they're the two
// categories with original, accurate, written-for-this-site content, not
// just outbound links, and the browse page gives them their own featured
// band above the generic filter grid for the same reason.
export const VALID_CATEGORIES = [
  'Financial Literacy', 'Spiritual Literacy',
  'Test Prep', 'Financial Aid', 'Mentorship', 'Templates & Guides',
  'Courses', 'Communities', 'Tools', 'Scholarship Search', 'Other',
]

const FREE_TEXT_FIELDS: (keyof ResourceSubmissionInput)[] = ['title', 'description']

const LINK_PATTERN = /https?:\/\/|www\./i
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const HANDLE_PATTERN = /(^|\s)@[a-zA-Z0-9_]{2,}/

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

export function validateResourceSubmission(input: Partial<ResourceSubmissionInput>): ValidationResult {
  const errors: string[] = []

  const title = (input.title ?? '').trim()
  const description = (input.description ?? '').trim()
  const url = (input.url ?? '').trim()
  const category = (input.category ?? '').trim()
  const audience = (input.audience ?? '').trim()
  const submitterEmail = (input.submitterEmail ?? '').trim().toLowerCase()

  if (!title) errors.push('Title is required.')
  if (!description || description.length < 20) errors.push('Description must be at least 20 characters — say what this actually is and who it helps.')
  if (!VALID_CATEGORIES.includes(category)) errors.push('Select what kind of resource this is.')
  if (!VALID_AUDIENCES.includes(audience)) errors.push('Invalid audience.')
  if (!isPlausibleEmail(submitterEmail)) errors.push('A valid contact email is required (used only for moderation — never published).')

  if (!url) {
    errors.push('A URL is required.')
  } else if (!/^https?:\/\//i.test(url)) {
    errors.push('The URL must start with http:// or https://.')
  } else {
    try {
      new URL(url)
    } catch {
      errors.push('The URL is not valid.')
    }
  }

  for (const field of FREE_TEXT_FIELDS) {
    const value = (input[field] ?? '').toString()
    if (!value) continue
    if (LINK_PATTERN.test(value)) errors.push(`"${field}" contains a link — the only link allowed is the URL field.`)
    if (EMAIL_PATTERN.test(value)) errors.push(`"${field}" contains an email address — that's not allowed outside the contact email field.`)
    if (HANDLE_PATTERN.test(value)) errors.push(`"${field}" contains an @handle — no account or social mentions are allowed.`)
  }

  return { ok: errors.length === 0, errors }
}
