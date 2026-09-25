import type { Audience } from '@/types'

/** Normalized shape every source adapter must return, before OpenAI classification. */
export interface RawListing {
  title: string
  url: string
  org?: string
  rawDescription: string
  location?: string
  audienceHint: Audience
  tags?: string            // comma-separated, from the source's own categories — omit rather than guess
  sourceLabel: string      // shown in ScrapeRun details, e.g. "RemoteOK"
  sourceUrl: string        // the feed/page this listing was found on, stored as Opportunity.sourceUrl

  // Every field below feeds JobPosting structured data — only ever set from
  // a value the source itself actually discloses, never inferred here.
  // employmentTypeHint is the source's own raw term (e.g. Adzuna's
  // "contract_type": "contract") — normalize() maps it to Google's enum;
  // leave unset if the source doesn't say. Salary fields must be set
  // together (min+max+currency) and only when the source marks the figure
  // as real/disclosed, not an estimate — see adzuna.ts's salary_is_predicted
  // check for the pattern to follow in any future source.
  employmentTypeHint?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  // Only set when a source hands back real structured location data (e.g.
  // Adzuna's location.area breakdown) more reliable than parsing `location`
  // text — takes priority over the text-based extraction in normalize.ts
  // when present.
  addressRegionHint?: string
  // Application deadline, when a source actually discloses one as structured
  // data. None of the current feeds do — this exists so that when one is added
  // that does, the adapter has somewhere honest to put it and it flows through
  // to JobPosting's `validThrough` with no parsing involved. An ISO string or
  // a Date; anything already past, or absurdly far out, is dropped by
  // lib/scraper/deadline.ts rather than trusted blindly.
  deadlineHint?: string | Date
}

export interface ScraperSource {
  name: string
  fetch(): Promise<RawListing[]>
}
