import type { RawListing } from '../types'

const FEED_URL = 'https://api.grants.gov/v1/api/search2'

interface GrantHit {
  id: string
  number: string
  title: string
  agency?: string
  oppStatus?: string
}

export async function fetchGrantsGov(): Promise<RawListing[]> {
  const res = await fetch(FEED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: 15, keyword: '', oppStatuses: 'forecasted|posted' }),
  })
  if (!res.ok) throw new Error(`Grants.gov responded ${res.status}`)

  const data = await res.json()
  // `??` only catches null/undefined, not "present but not an array" — see
  // lib/scraper/sources/arbeitnow.ts for the exact bug class this guards
  // against; `.filter()` below would throw and take down this whole source.
  const hits = (Array.isArray(data?.data?.oppHits) ? data.data.oppHits : []) as GrantHit[]

  return hits
    .filter(g => g.id && g.title)
    .map((g): RawListing => ({
      title: g.title.trim(),
      url: `https://www.grants.gov/search-results-detail/${g.id}`,
      org: g.agency,
      rawDescription: `Federal funding opportunity ${g.number} from ${g.agency ?? 'a US federal agency'}. Status: ${g.oppStatus ?? 'unknown'}.`,
      location: 'United States (federal)',
      audienceHint: 'FOUNDER',
      sourceLabel: 'Grants.gov',
      sourceUrl: 'https://www.grants.gov/search-grants',
    }))
}
