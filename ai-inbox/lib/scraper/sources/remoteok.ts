import type { RawListing } from '../types'
import { stripHtml } from '../util'

const FEED_URL = 'https://remoteok.com/api'
// RemoteOK is a general remote job board — filter down to roles that actually
// fit an "opportunities for students/early career" site, not senior hires.
const ENTRY_LEVEL = /\b(intern(ship)?|junior|entry[- ]level|graduate|new grad|apprentice|trainee)\b/i

interface RemoteOkJob {
  id?: string
  position?: string
  company?: string
  description?: string
  tags?: string[]
}

// `??` only catches null/undefined — an external, unversioned API can send
// a field typed as an array in our own interface but shaped as something
// else at runtime (this exact class of bug took down the Arbeitnow source:
// see lib/scraper/sources/arbeitnow.ts). Coercing by actual type, not
// nullishness, keeps one malformed listing from aborting the whole pass.
function tagArray(tags: unknown): string[] {
  return Array.isArray(tags) ? tags : []
}

export async function fetchRemoteOK(): Promise<RawListing[]> {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OppIDXScraper/1.0)' },
  })
  if (!res.ok) throw new Error(`RemoteOK responded ${res.status}`)

  const rows = (await res.json()) as RemoteOkJob[]
  // First entry is always RemoteOK's API terms-of-service notice, not a job.
  const jobs = Array.isArray(rows) ? rows.slice(1) : []

  return jobs
    .filter(j => j.id && j.position && ENTRY_LEVEL.test(`${j.position} ${tagArray(j.tags).join(' ')}`))
    .slice(0, 15)
    .map((j): RawListing => ({
      title: j.position!,
      url: `https://remoteok.com/remote-jobs/${j.id}`,
      org: j.company,
      rawDescription: stripHtml(j.description ?? ''),
      location: 'Remote',
      audienceHint: 'EARLY_CAREER',
      tags: tagArray(j.tags).slice(0, 5).join(','),
      sourceLabel: 'RemoteOK',
      sourceUrl: FEED_URL,
    }))
}
