import type { Audience } from '@/types'

/** Normalized shape every resource source adapter must return. */
export interface RawResource {
  title: string
  url: string
  description: string
  category: string
  audienceHint: Audience
  sourceLabel: string
  // Set when the source's own API call already proves the URL is live
  // (e.g. GitHub's search API returning a repo) — skips the runner's
  // redundant reachability re-check for that candidate.
  preVerified?: boolean
}

export interface ResourceScraperSource {
  name: string
  fetch(): Promise<RawResource[]>
}
