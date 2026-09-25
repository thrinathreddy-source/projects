import type { RawListing } from '../types'

// Official US federal government jobs API — real, first-party, well documented.
// Requires a free self-service key from developer.usajobs.gov (register with
// an email, no cost, no approval wait). Dormant until both env vars are set —
// returns [] quietly rather than erroring every hourly pass when unconfigured.
const FEED_URL = 'https://data.usajobs.gov/api/search'
const ENTRY_LEVEL = /\b(intern(ship)?|student|entry[- ]level|recent grad(uate)?|pathways)\b/i

interface UsaJobsPosition {
  MatchedObjectDescriptor?: {
    PositionTitle?: string
    PositionURI?: string
    OrganizationName?: string
    PositionLocationDisplay?: string
    UserArea?: { Details?: { JobSummary?: string } }
  }
}

export async function fetchUsaJobs(): Promise<RawListing[]> {
  const apiKey = process.env.USAJOBS_API_KEY
  const userAgent = process.env.USAJOBS_USER_AGENT_EMAIL
  if (!apiKey || !userAgent) return []

  const url = `${FEED_URL}?Keyword=intern&ResultsPerPage=25`
  const res = await fetch(url, {
    headers: {
      Host: 'data.usajobs.gov',
      'User-Agent': userAgent,
      'Authorization-Key': apiKey,
    },
  })
  if (!res.ok) throw new Error(`USAJobs responded ${res.status}`)

  const data = (await res.json()) as { SearchResult?: { SearchResultItems?: UsaJobsPosition[] } }
  // `??` only catches null/undefined, not "present but not an array" — see
  // lib/scraper/sources/arbeitnow.ts for the exact bug class this guards
  // against; `.map()` below would throw and take down this whole source.
  const items = Array.isArray(data.SearchResult?.SearchResultItems) ? data.SearchResult.SearchResultItems : []

  return items
    .map(i => i.MatchedObjectDescriptor)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.PositionTitle && d.PositionURI && ENTRY_LEVEL.test(d.PositionTitle)))
    .slice(0, 15)
    .map((d): RawListing => ({
      title: d.PositionTitle!,
      url: d.PositionURI!,
      org: d.OrganizationName,
      rawDescription: d.UserArea?.Details?.JobSummary ?? `${d.PositionTitle} — a US federal government position.`,
      location: d.PositionLocationDisplay,
      audienceHint: 'STUDENT',
      sourceLabel: 'USAJobs',
      sourceUrl: 'https://www.usajobs.gov/',
    }))
}
