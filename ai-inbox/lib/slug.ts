/**
 * Human-readable listing URLs.
 *
 * Every opportunity URL used to be its raw cuid — `/opportunities/cm3x8k…`.
 * That cost twice: search engines got no keyword signal from the path, and a
 * link pasted into a group chat (exactly the place this board is meant to
 * spread) looked like a tracking URL rather than a real posting. Slugs are
 * derived from facts already stored on the row — never invented, never
 * padded with keywords the listing doesn't actually claim.
 */

/** cuid v1, which is what Prisma's `@default(cuid())` generates: a literal
 * "c" followed by 24 base-36 characters. Used to tell an old-style id from a
 * slug in a single route param, so both keep resolving. */
const CUID_RE = /^c[a-z0-9]{24}$/

export function isCuid(value: string): boolean {
  return CUID_RE.test(value)
}

/**
 * The one canonical path for a listing — its slug when it has one, its id
 * until the backfill reaches it. Every place that builds a listing URL
 * (canonical tag, breadcrumbs, share bar, cards, sitemap, OG image) goes
 * through this, so the two forms can't drift apart and produce a card
 * linking somewhere the canonical tag disagrees with.
 */
export function opportunityPath(opp: { id: string; slug?: string | null }): string {
  return `/opportunities/${opp.slug || opp.id}`
}

/** Lowercase, ASCII, hyphen-separated. Diacritics are folded rather than
 * dropped so "Fondation Française" becomes "fondation-francaise" instead of
 * "fondation-franaise". */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Long titles get truncated on a word boundary — a 180-character slug helps
 * nobody, and Google gives no extra weight to the tail of a path. */
function truncateOnWord(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const lastHyphen = cut.lastIndexOf('-')
  return lastHyphen > 20 ? cut.slice(0, lastHyphen) : cut
}

const MAX_TITLE_PART = 70

/**
 * A short random suffix, so `buildSlug` can run *before* the insert and the
 * slug goes in with the same write as the row — rather than costing every
 * created listing a second UPDATE, which matters on the hourly scrape that
 * inserts in bulk.
 *
 * Math.random rather than node:crypto deliberately: this module is imported
 * by OpportunityCard, a client component, so it has to stay free of Node
 * built-ins. Collision resistance doesn't rest on this value anyway — the
 * unique index on Opportunity.slug is what actually guarantees uniqueness,
 * and the two writers that can hit one both already handle a unique-
 * constraint error (the scraper skips the row, the backfill falls back to
 * the id).
 */
export function randomDiscriminator(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0')
}

/**
 * Builds `title-org-<discriminator>` from facts already on the row.
 *
 * The discriminator is passed in rather than derived here so both callers
 * get what they need: the backfill (scripts/backfill-slugs.ts) passes the
 * last 6 characters of the row's own cuid, which makes the result stable if
 * it's ever recomputed for an existing row, while create paths pass a fresh
 * randomDiscriminator().
 */
export function buildSlug(opp: { title: string; org: string | null }, discriminator: string): string {
  const titlePart = truncateOnWord(slugify(opp.title), MAX_TITLE_PART)
  const orgPart = opp.org ? slugify(opp.org) : ''

  // An org already named in the title adds nothing but length —
  // "google-stem-scholarship-google-abc123" reads worse than the same slug
  // without the repeat, and duplicated tokens in a path are a mild spam
  // signal rather than a ranking gain.
  const parts = [titlePart]
  if (orgPart && !titlePart.includes(orgPart)) parts.push(orgPart)
  parts.push(discriminator)

  return parts.filter(Boolean).join('-')
}

/** buildSlug with a fresh random suffix — what every create path wants. */
export function newSlug(opp: { title: string; org: string | null }): string {
  return buildSlug(opp, randomDiscriminator())
}
