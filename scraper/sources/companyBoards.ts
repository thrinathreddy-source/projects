import type { RawListing } from '../types'
import { stripHtml } from '../util'

// Each token below is a real company's own public Greenhouse job-board API
// (first-party data, no auth, no third party in between) — verified live
// before being added. Spans multiple continents on purpose. To add another
// company, confirm https://boards-api.greenhouse.io/v1/boards/{token}/jobs
// actually returns real postings before adding it here.
const GREENHOUSE_COMPANIES: { token: string; name: string }[] = [
  // North America
  { token: 'airbnb', name: 'Airbnb' },
  { token: 'robinhood', name: 'Robinhood' },
  { token: 'figma', name: 'Figma' },
  { token: 'coinbase', name: 'Coinbase' },
  { token: 'asana', name: 'Asana' },
  { token: 'pinterest', name: 'Pinterest' },
  { token: 'gitlab', name: 'GitLab' },
  // Europe
  { token: 'adyen', name: 'Adyen' },
  { token: 'monzo', name: 'Monzo' },
  { token: 'trustpilot', name: 'Trustpilot' },
  // Africa
  { token: 'jumia', name: 'Jumia' },
  // South America
  { token: 'nubank', name: 'Nubank' },
  // India
  { token: 'postman', name: 'Postman' },
  { token: 'groww', name: 'Groww' },
  { token: 'phonepe', name: 'PhonePe' },
]

const ENTRY_LEVEL = /\b(intern(ship)?|junior|entry[- ]level|new grad|graduate|apprentice|university)\b/i

interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  location?: { name?: string }
  content?: string
}

async function fetchGreenhouseCompany({ token, name }: { token: string; name: string }): Promise<RawListing[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`)
  if (!res.ok) return []

  const data = (await res.json()) as { jobs?: GreenhouseJob[] }
  const jobs = Array.isArray(data.jobs) ? data.jobs : []

  return jobs
    .filter(j => ENTRY_LEVEL.test(j.title))
    .slice(0, 5) // cap per company so one large employer can't dominate a pass
    .map((j): RawListing => ({
      title: j.title,
      url: j.absolute_url,
      org: name,
      rawDescription: stripHtml(j.content ?? '').slice(0, 2000) || `${j.title} at ${name}.`,
      location: j.location?.name?.replace(/;\s*/g, ' · '),
      audienceHint: 'EARLY_CAREER',
      sourceLabel: 'Greenhouse',
      sourceUrl: `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
    }))
}

export async function fetchCompanyBoards(): Promise<RawListing[]> {
  const results = await Promise.allSettled(GREENHOUSE_COMPANIES.map(fetchGreenhouseCompany))
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}
