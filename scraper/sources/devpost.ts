import type { RawListing } from '../types'

const FEED_URL = 'https://devpost.com/api/hackathons?status[]=open&order_by=recently-added'

interface DevpostHackathon {
  id: number
  title: string
  url: string
  organization_name?: string
  displayed_location?: { location?: string }
  themes?: { name: string }[]
  prizes_counts?: { cash?: number; other?: number }
  submission_period_dates?: string
  invite_only?: boolean
  eligibility_requirement_invite_only_description?: string
}

// `??` only catches null/undefined — an external, unversioned API can send
// a field typed as an array in our own interface but shaped as something
// else at runtime (this exact class of bug took down the Arbeitnow source:
// see lib/scraper/sources/arbeitnow.ts). Coercing by actual type, not
// nullishness, keeps one malformed listing from aborting the whole pass.
function themeArray(themes: unknown): { name: string }[] {
  return Array.isArray(themes) ? themes : []
}

export async function fetchDevpost(): Promise<RawListing[]> {
  const res = await fetch(FEED_URL)
  if (!res.ok) throw new Error(`Devpost responded ${res.status}`)

  const data = (await res.json()) as { hackathons?: DevpostHackathon[] }
  const list = Array.isArray(data.hackathons) ? data.hackathons : []

  return list.slice(0, 15).map((h): RawListing => {
    const themeNames = themeArray(h.themes).map(t => t.name).join(', ')
    const cashPrize = h.prizes_counts?.cash
    return {
      title: h.title.trim(),
      url: h.url,
      org: h.organization_name || undefined,
      rawDescription: [
        themeNames ? `Themes: ${themeNames}.` : 'General hackathon.',
        cashPrize ? 'Cash prizes available.' : '',
        h.submission_period_dates ? `Submission window: ${h.submission_period_dates}.` : '',
        h.invite_only && h.eligibility_requirement_invite_only_description
          ? `Eligibility: ${h.eligibility_requirement_invite_only_description}.`
          : '',
      ].filter(Boolean).join(' '),
      location: h.displayed_location?.location,
      audienceHint: 'STUDENT',
      tags: themeArray(h.themes).slice(0, 5).map(t => t.name.toLowerCase()).join(','),
      sourceLabel: 'Devpost',
      sourceUrl: 'https://devpost.com/hackathons',
    }
  })
}
