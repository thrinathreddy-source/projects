import { ADZUNA_SOURCE_URL } from '@/lib/sourceIds'

/**
 * The `rel` value for a link off this site to a listing's own application page.
 *
 * Every outbound listing link used to carry only `rel="noopener noreferrer"`.
 * Those are privacy and security attributes — `noreferrer` suppresses the
 * Referer header — and neither says anything to a search engine about whether
 * the link is an endorsement. With roughly 2,700 listings, each with a link
 * out, that is a large amount of unqualified outbound linking from a single
 * domain, which is the shape Google's link-spam policy is written about.
 *
 * Two values, because the two cases genuinely differ:
 *
 *   sponsored — the destination identifies this site as the referrer for
 *               commercial purposes. Adzuna's redirect_url embeds a publisher
 *               id (`utm_source=5c4fc3a8`), which is exactly what
 *               `rel="sponsored"` is specified for, regardless of whether any
 *               money has actually changed hands yet.
 *
 *   nofollow  — everything else. Not an accusation of anything; simply "this
 *               is a listing we catalogued, not a page we vouch for." The
 *               honest default for a directory.
 *
 * Deliberately keyed off `sourceUrl` — the exact constant the scraper stores —
 * rather than sniffing the destination hostname, so it stays consistent with
 * how the Jobicy/Adzuna on-page credits are already keyed
 * (app/opportunities/[id]/page.tsx) and can't be fooled by a redirect chain.
 */
export function outboundRel(sourceUrl?: string | null): string {
  const base = 'noopener noreferrer'
  return sourceUrl === ADZUNA_SOURCE_URL
    ? `sponsored ${base}`
    : `nofollow ${base}`
}

/** For links to pages this site merely references — scraped policy headlines,
 * submitted resources — where there is no commercial relationship at all. */
export const REFERENCE_REL = 'nofollow noopener noreferrer'
