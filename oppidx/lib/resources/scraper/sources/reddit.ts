import type { RawResource } from '../types'

// Reddit's unauthenticated www.reddit.com/*.json endpoints hard-block
// requests from datacenter/cloud IPs (verified live: a plain fetch from a
// server gets a 403 HTML challenge page, not JSON, regardless of
// User-Agent) — which is exactly where this runs (Vercel). The only
// reliable way to call Reddit's API server-side is OAuth2 client-credentials
// against oauth.reddit.com. Register a free "script" app at
// https://www.reddit.com/prefs/apps (personal use, no approval wait) and set
// REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET — dormant (returns []) until both
// are set, same pattern as USAJobs in lib/scraper/sources/usaJobs.ts.

// Curated, well-moderated subreddits known for sharing real external
// resources (not general discussion) — each mapped to one category. Only
// external-link posts (not self-text threads) above a score floor are
// considered, and everything still has to pass the same live-link +
// duplicate checks as a public submission before it's ever created (see
// lib/resources/scraper/run.ts) — this source only proposes candidates.
const SUBREDDITS: { name: string; category: string; audienceHint: 'STUDENT' | 'GENERAL'; minScore: number }[] = [
  { name: 'GetStudying', category: 'Test Prep', audienceHint: 'STUDENT', minScore: 40 },
  { name: 'scholarships', category: 'Scholarship Search', audienceHint: 'STUDENT', minScore: 20 },
  { name: 'personalfinance', category: 'Financial Literacy', audienceHint: 'GENERAL', minScore: 150 },
  { name: 'IndiaInvestments', category: 'Financial Literacy', audienceHint: 'GENERAL', minScore: 80 },
]

const MAX_PER_SUBREDDIT = 5
const USER_AGENT = 'OppIDX-ResourceScraper/1.0 (by /u/oppidx; contact: hello@oppidx.com)'

interface RedditChild {
  data: {
    title: string
    url: string
    is_self: boolean
    over_18: boolean
    score: number
    domain: string
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Reddit OAuth token request responded ${res.status}`)

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('Reddit OAuth token response had no access_token')

  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000 }
  return cachedToken.value
}

async function fetchSubreddit(
  { name, category, audienceHint, minScore }: (typeof SUBREDDITS)[number],
  token: string,
): Promise<RawResource[]> {
  const res = await fetch(`https://oauth.reddit.com/r/${name}/top.json?t=month&limit=25`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Reddit r/${name} responded ${res.status}`)

  const data = (await res.json()) as { data?: { children?: RedditChild[] } }
  const posts = (data.data?.children ?? []).map(c => c.data)

  return posts
    .filter(p =>
      !p.is_self &&
      !p.over_18 &&
      p.score >= minScore &&
      !p.domain.includes('reddit.com') &&
      !p.domain.includes('redd.it')
    )
    .slice(0, MAX_PER_SUBREDDIT)
    .map((p): RawResource => ({
      title: p.title.trim().slice(0, 300),
      url: p.url,
      description: `Shared on r/${name} — ${p.score.toLocaleString()} upvotes this month.`,
      category,
      audienceHint,
      sourceLabel: 'Reddit',
    }))
}

export async function fetchRedditResources(): Promise<RawResource[]> {
  const token = await getAccessToken()
  if (!token) return [] // dormant until REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET are set

  const results = await Promise.allSettled(SUBREDDITS.map(s => fetchSubreddit(s, token)))
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}
