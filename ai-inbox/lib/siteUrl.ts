// www.oppidx.com is the actual primary domain — Vercel's own domain config
// redirects the apex (oppidx.com) to it, not the other way around (verified
// directly against the live Domains dashboard, not assumed). Every
// canonical/sitemap/JSON-LD URL needs to point at the domain that doesn't
// itself redirect, or Google is being told the canonical page lives at a
// URL that immediately 308s elsewhere — which is exactly what caused the
// original duplicate-indexing split between the two hosts.
/** Canonical production origin — used for sitemap, robots, OG images, JSON-LD, and RSS. */
export const SITE_URL = 'https://www.oppidx.com'

/** Bare display domain — for share text, SMS, PDFs, anywhere a full URL is too long.
 * Left as the apex form (shorter, no "www."); the apex cleanly redirects to
 * SITE_URL in a single hop, so this is still correct as something a human
 * would type or read, just not what we hand a crawler as the canonical URL. */
export const DISPLAY_DOMAIN = 'oppidx.com'
