import type { RawListing } from '../types'

// Same idea as companyBoards.ts but for Lever's public postings API — each
// token is a real company's own first-party board, verified live (including
// checking actual job locations, not just that the token 200s: several
// company-name-shaped tokens on both Greenhouse and Lever belong to a
// completely different company that happens to share the string, e.g.
// "tcs" on Greenhouse is a UK clinical staffing firm, not Tata Consultancy
// Services — confirm real postings with real matching locations before
// adding a token here.
const LEVER_COMPANIES: { token: string; name: string }[] = [
  { token: 'paytm', name: 'Paytm' },
  { token: 'zeta', name: 'Zeta' },
]

const ENTRY_LEVEL = /\b(intern(ship)?|junior|entry[- ]level|new grad|graduate|apprentice|trainee)\b/i

interface LeverPosting {
  text: string
  hostedUrl: string
  categories?: { location?: string }
  descriptionPlain?: string
}

async function fetchLeverCompany({ token, name }: { token: string; name: string }): Promise<RawListing[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`)
  if (!res.ok) return []

  const postings = (await res.json()) as LeverPosting[]
  if (!Array.isArray(postings)) return []

  return postings
    .filter(p => ENTRY_LEVEL.test(p.text))
    .slice(0, 5) // cap per company so one large employer can't dominate a pass
    .map((p): RawListing => ({
      title: p.text,
      url: p.hostedUrl,
      org: name,
      rawDescription: (p.descriptionPlain ?? `${p.text} at ${name}.`).slice(0, 2000),
      location: p.categories?.location,
      audienceHint: 'EARLY_CAREER',
      sourceLabel: 'Lever',
      sourceUrl: `https://api.lever.co/v0/postings/${token}`,
    }))
}

export async function fetchLeverBoards(): Promise<RawListing[]> {
  const results = await Promise.allSettled(LEVER_COMPANIES.map(fetchLeverCompany))
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}
