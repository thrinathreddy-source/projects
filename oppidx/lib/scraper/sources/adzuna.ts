import type { RawListing } from '../types'
import { stripHtml } from '../util'

// Adzuna job-search API — real, first-party, covers 19 countries including
// India, the US, and the UK. Free self-service key from developer.adzuna.com
// (email signup, no approval wait, no cost within the free-tier rate limit).
// Dormant until both env vars are set — returns [] quietly rather than
// erroring every hourly pass when unconfigured.
const COUNTRIES = ['in', 'us', 'gb'] as const

// Adzuna's job object carries no explicit currency field — amounts are
// implicitly in the local currency of whichever country endpoint was
// queried, so this maps 1:1 with COUNTRIES above.
const CURRENCY_BY_COUNTRY: Record<string, string> = { in: 'INR', us: 'USD', gb: 'GBP' }

// Defined in lib/sourceIds.ts (a dependency-free module) and re-exported
// here so this adapter's own callers are unchanged. It lives there because
// lib/seo/outboundRel.ts needs it from a client component, and importing it
// from this file dragged the whole adapter into the browser bundle.
export { ADZUNA_SOURCE_URL as SOURCE_URL } from '@/lib/sourceIds'
import { ADZUNA_SOURCE_URL as SOURCE_URL } from '@/lib/sourceIds'

// Matches the ENTRY_LEVEL pattern other sources (e.g. arbeitnow.ts) use to
// tag internships from the title — Adzuna's own "internship" search term
// only scopes the query, it isn't echoed back as a category or tag field.
const INTERNSHIP_TITLE = /\bintern(ship)?\b/i

interface AdzunaJob {
  id?: string
  title?: string
  description?: string
  redirect_url?: string
  company?: { display_name?: string }
  location?: { display_name?: string; area?: string[] }
  category?: { label?: string }
  contract_type?: string      // real, disclosed: "full_time" | "part_time" | "contract" | "permanent"
  salary_min?: number
  salary_max?: number
  // "1" when Adzuna's own model estimated the figure rather than the
  // employer disclosing it — never used for baseSalary, since an estimate
  // presented as fact would be exactly the kind of inaccurate structured
  // data Google's JobPosting policy exists to catch.
  salary_is_predicted?: string
}

async function fetchCountry(country: string, appId: string, appKey: string): Promise<RawListing[]> {
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=15&what=internship%20OR%20graduate%20OR%20entry%20level&content-type=application/json`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OppIDXScraper/1.0)' } })
  if (!res.ok) throw new Error(`Adzuna (${country}) responded ${res.status}`)

  const data = (await res.json()) as { results?: AdzunaJob[] }
  // `??` only catches null/undefined, not "present but not an array" — see
  // lib/scraper/sources/arbeitnow.ts for the exact bug class this guards
  // against; `.filter()` below would throw and take down this whole source.
  const jobs = Array.isArray(data.results) ? data.results : []

  return jobs
    .filter(j => j.id && j.title && j.redirect_url)
    .map((j): RawListing => {
      const tags = [
        j.category?.label?.toLowerCase(),
        INTERNSHIP_TITLE.test(j.title!) ? 'internship' : null,
      ].filter((t): t is string => Boolean(t)).join(',')

      // area is ordered broad-to-specific, e.g. ["US","Virginia","Fauquier
      // County","Warrenton"] — index 1 is the real state/province Adzuna
      // itself resolved, more reliable than parsing display_name text.
      const addressRegionHint = Array.isArray(j.location?.area) ? j.location.area[1] : undefined
      const hasRealSalary = j.salary_is_predicted !== '1' && j.salary_min != null && j.salary_max != null

      return {
        title: j.title!,
        url: j.redirect_url!,
        org: j.company?.display_name,
        rawDescription: stripHtml(j.description ?? ''),
        location: j.location?.display_name,
        audienceHint: 'EARLY_CAREER',
        tags: tags || undefined,
        sourceLabel: 'Adzuna',
        sourceUrl: SOURCE_URL,
        employmentTypeHint: j.contract_type,
        addressRegionHint: addressRegionHint || undefined,
        ...(hasRealSalary ? {
          salaryMin: j.salary_min,
          salaryMax: j.salary_max,
          salaryCurrency: CURRENCY_BY_COUNTRY[country],
        } : {}),
      }
    })
}

export async function fetchAdzuna(): Promise<RawListing[]> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) return []

  const perCountry = await Promise.all(
    COUNTRIES.map(c => fetchCountry(c, appId, appKey).catch(err => {
      console.error(`[scraper] Adzuna (${c}) failed:`, err)
      return [] as RawListing[]
    })),
  )
  return perCountry.flat()
}
