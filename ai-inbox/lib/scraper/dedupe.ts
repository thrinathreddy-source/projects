/**
 * Identity for a scraped listing — the two keys that decide whether an
 * incoming listing is something the board already has.
 *
 * This exists because the original check (`findFirst({ where: { url } })` in
 * run.ts, an exact string match on the destination URL) let the same listing
 * in over and over. Adzuna's `redirect_url` — stored verbatim as
 * Opportunity.url — carries a per-response tracking token in `se=`, so the
 * same ad came back as a different string on every hourly pass, the
 * existence check missed, and a brand-new indexable page was minted for a job
 * already on the board. One recruitment-fair ad reached 33 live URLs that
 * way, each with its own slug and its own self-referencing canonical: exactly
 * the near-duplicate cluster Google's job-posting quality rules penalise.
 *
 * Two keys rather than one, because the two failure modes are different:
 *
 *   urlKey     — same posting, unstable URL. Deterministic from the URL,
 *                enforced by a UNIQUE index on Opportunity.urlKey, so a
 *                regression here fails at the database rather than quietly
 *                producing duplicates for weeks.
 *
 *   contentKey — a lossy title|org|location fingerprint. Stored and indexed
 *                for REPORTING ONLY. It never blocks an insert and never
 *                deletes anything, because measurement against the real board
 *                showed it cannot safely do either: of 105 rows it would have
 *                collapsed, most were genuinely distinct requisitions —
 *                Anduril, Twilio, MongoDB and PayPal each post several open
 *                roles under one title at one location, with different ATS
 *                job ids. Auto-collapsing those would have destroyed real
 *                listings to fix a cosmetic duplication.
 *
 *                It does catch real cases urlKey can't (arbeitnow re-slugs a
 *                single job with a rotating numeric suffix, producing five
 *                URLs for one posting), so the clusters are surfaced in the
 *                weekly SEO report for a human to judge instead of being
 *                actioned automatically. See app/api/cron/seo-audit/route.ts.
 */

/**
 * Query parameters that identify the *click*, not the *listing*. Stripped
 * from the dedupe key only — never from Opportunity.url itself, since
 * partner terms (Adzuna, Jobicy) can require the tracked link to be the one
 * a visitor actually follows, and rewriting it could break their attribution.
 */
const TRACKING_PARAMS = new Set([
  'se',           // Adzuna — rotates per API response; the direct cause of the 33x duplication
  'v',            // Adzuna — response-version hash, not part of ad identity
  'ref', 'refid', 'referrer', 'source', 'src',
  'fbclid', 'gclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid',
  'trk', 'trackingId', 'position', 'pageNum',
])

/**
 * Canonical, comparable form of a listing URL.
 *
 * Lowercases the host and drops a leading "www." (host case and that prefix
 * are never significant), leaves the path case alone (some servers do treat
 * it as significant), drops tracking parameters, and sorts what remains so
 * two orderings of the same query compare equal. Meaningful query params are
 * deliberately KEPT — plenty of ATS links carry the posting id there
 * (`?gh_jid=8646146002`), and dropping the query wholesale would collapse
 * genuinely different jobs into one.
 *
 * Falls back to the trimmed original for anything `URL` won't parse, so an
 * odd link still gets a stable key instead of throwing mid-pass.
 */
export function urlKey(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  try {
    const u = new URL(trimmed)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const path = u.pathname.replace(/\/+$/, '')

    const kept = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.has(k) && !k.toLowerCase().startsWith('utm_'))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    const query = kept.map(([k, v]) => `${k}=${v}`).join('&')
    return `${host}${path}${query ? `?${query}` : ''}`
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '')
  }
}

/** Lowercase, strip punctuation and collapse whitespace — so "Software
 * Engineer (m/w/d)" and "software engineer m w d" fingerprint alike. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Fingerprint of what a listing broadly *is* — a duplicate-review signal, not
 * a dedupe key. Nothing acts on this automatically; see the module comment.
 *
 * Location is part of the key, and has to be: teampicnic posts one
 * "Graduate Operations Supervisor (m/w/d)" in Kabelsketal, Essen and Halle,
 * and a title+org-only fingerprint would flag three separate applyable jobs
 * as one. Even with location included the signal stays advisory, because
 * several employers on this board legitimately run multiple open reqs under
 * one title in one city.
 *
 * Returns null when there's no org to anchor on — title alone is far too
 * weak ("Software Engineer" would match across every company on the board).
 */
export function contentKey(listing: { title: string; org?: string | null; location?: string | null }): string | null {
  const org = fold(listing.org ?? '')
  if (!org) return null

  const title = fold(listing.title)
  if (!title) return null

  return [title, org, fold(listing.location ?? '')].join('|')
}
