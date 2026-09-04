/**
 * Stable identifiers for the feeds the scraper ingests, stored verbatim on
 * Opportunity.sourceUrl.
 *
 * These live here, in a module with no imports of its own, rather than in the
 * source adapters that use them — because non-scraper code needs them too.
 * `lib/seo/outboundRel.ts` keys the sponsored/nofollow decision off the Adzuna
 * id, and it is imported by OpportunityCard, which is a client component. With
 * the constant exported from `lib/scraper/sources/adzuna.ts`, that import
 * chain ran client component -> SEO helper -> scraper adapter.
 *
 * Measured honestly: the bundler was already tree-shaking the adapter, so no
 * ingestion code actually reached the browser (checked both with and without
 * this indirection — api.adzuna.com, results_per_page and CURRENCY_BY_COUNTRY
 * appear in zero client chunks either way). This is therefore hygiene, not an
 * incident. It still matters: tree-shaking is not a guarantee, and the moment
 * that adapter gains any module-level side effect or a top-level env read, the
 * old import path would have shipped it to every visitor.
 *
 * The adapters re-export from here, so their own imports keep working.
 */

/** Adzuna — see lib/scraper/sources/adzuna.ts. */
export const ADZUNA_SOURCE_URL = 'https://www.adzuna.com/'

/** Jobicy — see lib/scraper/sources/jobicy.ts. Their API terms require a
 * direct credit link on any listing sourced from it. */
export const JOBICY_FEED_URL = 'https://jobicy.com/api/v2/remote-jobs?count=50'
