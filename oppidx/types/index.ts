export type Audience = 'STUDENT' | 'EARLY_CAREER' | 'FOUNDER' | 'GENERAL'
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export interface Opportunity {
  id: string
  /** Human-readable URL segment (see lib/slug.ts). Null on rows written
   * before slugs existed and not yet covered by scripts/backfill-slugs.ts —
   * build listing links with opportunityPath(), never by hand, so those
   * rows keep resolving by id. */
  slug: string | null
  title: string
  description: string
  url: string
  org: string | null
  audience: Audience
  eligibility: string
  prepResources: string
  difficulty: Difficulty
  tags: string
  location: string | null
  region: string
  country: string
  compType: string | null
  imageUrl: string | null
  videoUrl: string | null
  viewCount: number
  verified: boolean
  featured: boolean
  source: string
  sourceUrl: string | null
  addedAt: string
}

export interface Stats {
  opportunities: number
  viewed: number
  subscribers: number
}

export interface Resource {
  id: string
  title: string
  description: string
  url: string
  category: string
  audience: Audience
  verified: boolean
  body: string
  source: string
  submitterEmail: string | null
  addedAt: string
}

export interface Facet {
  value: string
  count: number
}

export interface ScrapeRun {
  id: string
  startedAt: string
  finishedAt: string
  added: number
  details: string
}

// Same shape as ScrapeRun, kept as a distinct type since it's a separate
// Prisma model (ResourceScrapeRun) with its own history.
export type ResourceScrapeRun = ScrapeRun

export interface Subscriber {
  id: string
  email: string
  subscribedAt: string
  plan: string
  paymentProvider: string | null
  paymentSubscriptionId: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
}

export interface SponsoredSlot {
  id: string
  sponsorName: string
  sponsorUrl: string
  tagline: string
  type: 'sidebar' | 'feed_card'
  startDate: string
  endDate: string
  createdAt: string
}
