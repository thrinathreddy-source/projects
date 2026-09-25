const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: 'Student opportunity',
  EARLY_CAREER: 'Early-career role',
  FOUNDER: 'Founder opportunity',
  GENERAL: 'Opportunity',
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time role',
  PART_TIME: 'Part-time role',
  CONTRACTOR: 'Contract role',
  TEMPORARY: 'Temporary role',
  INTERN: 'Internship',
  VOLUNTEER: 'Volunteer role',
}

/**
 * Writes the opportunity summary line as pure templating over fields the
 * row already has — no LLM call, no tokens, no cost. Same "never invent a
 * detail" guarantee as the AI version by construction: every clause below
 * reads directly off a real column (org, location, compType, employmentType,
 * audience), nothing free-text or generated. Exists for the exact reason
 * lib/policyDigest/summarize.ts does — a genuinely automated fallback for
 * whenever the AI-backed version (lib/scraper/summarize.ai.ts, same "never
 * fake it" rule, written by GPT instead of templated) isn't in budget.
 * Swap the import in lib/scraper/run.ts (and scripts/backfill-summaries.ts)
 * back to summarize.ai.ts once there's OpenAI credit again — nothing else
 * needs to change, callers on both sides return the same `string | null`
 * shape.
 */
export function templateOpportunitySummary(opp: {
  org: string | null
  location: string | null
  audience: string
  employmentType: string | null
  compType: string | null
}): string | null {
  const roleType = (opp.employmentType && EMPLOYMENT_LABEL[opp.employmentType]) || AUDIENCE_LABEL[opp.audience] || 'Opportunity'

  const clauses = [roleType]
  if (opp.org) clauses.push(`at ${opp.org}`)
  if (opp.location) clauses.push(`in ${opp.location}`)

  let summary = clauses.join(' ')
  if (opp.compType) summary += ` — ${opp.compType.toLowerCase()}`
  // org/location/compType are free text from the source (or, for
  // user-submitted opportunities, the submitter) — "Stripe, Inc." or
  // "Washington, D.C." already end in a period, and blindly appending one
  // produced a visible ".." in both the on-page summary and the SEO meta
  // description built from it.
  if (!/[.!?]$/.test(summary)) summary += '.'

  return summary
}
