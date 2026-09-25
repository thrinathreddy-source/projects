import type { RawListing } from '../types'

// Community-maintained internship board (Pitt CSC + Simplify), updated continuously
// via GitHub Actions — a stable, ToS-friendly public feed rather than scraping company sites directly.
const FEED_URL = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json'

interface SimplifyListing {
  title: string
  company_name?: string
  category?: string
  terms?: string[]
  locations?: string[]
  url: string
  active?: boolean
  is_visible?: boolean
}

export async function fetchGithubInternships(): Promise<RawListing[]> {
  const res = await fetch(FEED_URL)
  if (!res.ok) throw new Error(`GitHub internship feed responded ${res.status}`)

  const rows = (await res.json()) as SimplifyListing[]
  const list = Array.isArray(rows) ? rows : []

  return list
    .filter(r => r.active && r.is_visible && r.url && r.title)
    .slice(0, 15)
    .map((r): RawListing => ({
      title: r.title,
      url: r.url,
      org: r.company_name,
      rawDescription: `${r.category || 'Internship'} internship${
        r.terms?.length ? ` for ${r.terms.join(', ')}` : ''
      }.`,
      location: r.locations?.[0],
      audienceHint: 'STUDENT',
      tags: r.category ? r.category.toLowerCase() : undefined,
      sourceLabel: 'Simplify Jobs (GitHub)',
      sourceUrl: 'https://github.com/SimplifyJobs/Summer2026-Internships',
    }))
}
