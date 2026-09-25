import type { RawListing } from '../types'

// Community-maintained aggregator (refreshed every ~5 min), itself pulled
// from real company Greenhouse/Lever boards — a legit, ToS-friendly feed
// rather than scraping each company's career page ourselves.
const FEED_URL = 'https://raw.githubusercontent.com/ambicuity/New-Grad-Jobs/main/docs/jobs.json'

interface NewGradJob {
  company?: string
  title?: string
  location?: string
  url?: string
  category?: { name?: string }
  is_closed?: boolean
  description?: string
}

export async function fetchNewGradJobs(): Promise<RawListing[]> {
  const res = await fetch(FEED_URL)
  if (!res.ok) throw new Error(`New-Grad-Jobs feed responded ${res.status}`)

  const data = (await res.json()) as { jobs?: NewGradJob[] }
  const jobs = Array.isArray(data.jobs) ? data.jobs : []

  return jobs
    .filter(j => !j.is_closed && j.url && j.title && j.company)
    .slice(0, 15)
    .map((j): RawListing => ({
      title: j.title!,
      url: j.url!,
      org: j.company,
      rawDescription: (j.description || `${j.category?.name ?? 'New-grad'} role at ${j.company}.`).slice(0, 2000),
      location: j.location,
      audienceHint: 'EARLY_CAREER',
      tags: j.category?.name ? j.category.name.toLowerCase() : undefined,
      sourceLabel: 'New-Grad-Jobs (GitHub)',
      sourceUrl: 'https://github.com/ambicuity/New-Grad-Jobs',
    }))
}
