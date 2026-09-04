import type { RawResource } from '../types'

// Topic-based search instead of a hand-picked repo list — GitHub topics are
// community-applied tags, so searching by topic + a stars floor surfaces
// real, community-validated resources at real volume without us hand-typing
// every repo name. Each topic maps to one category; minStars is the quality
// bar (higher for broad/crowded topics, lower for narrower ones with fewer
// good entries). No "awesome-list" topic on purpose — it's a meta-topic (a
// list of other lists), which is exactly the "just goes to github.com, not
// the actual source" complaint; "developer-tools" below is a more direct
// substitute for the same Tools category.
const TOPICS: { topic: string; category: string; minStars: number }[] = [
  { topic: 'developer-tools', category: 'Tools', minStars: 500 },
  { topic: 'interview-prep', category: 'Test Prep', minStars: 150 },
  { topic: 'coding-interview', category: 'Test Prep', minStars: 300 },
  { topic: 'computer-science', category: 'Courses', minStars: 300 },
  { topic: 'free-education', category: 'Courses', minStars: 100 },
  { topic: 'personal-finance', category: 'Financial Literacy', minStars: 100 },
  { topic: 'cheatsheet', category: 'Templates & Guides', minStars: 300 },
  { topic: 'roadmap', category: 'Templates & Guides', minStars: 500 },
]

const PER_TOPIC = 25
// GitHub's unauthenticated search endpoint allows ~10 req/min — space
// requests out so a full pass of TOPICS.length calls doesn't get 429'd.
const REQUEST_GAP_MS = 6500

interface GithubSearchItem {
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// GitHub topic search surfaces plenty of real, well-starred repos with
// non-English descriptions (Russian, Chinese, etc.) — legitimate projects,
// just not usable for a site whose audience reads English. A handful of
// stray non-Latin characters (an accented name, an emoji) is fine; a
// description mostly made of another script isn't.
const NON_LATIN_SCRIPT = /[Ѐ-ӿ؀-ۿ぀-ヿ一-鿿가-힯ऀ-ॿ]/g

function isEnglishEnough(text: string): boolean {
  const matches = text.match(NON_LATIN_SCRIPT)
  return (matches?.length ?? 0) <= 5
}

async function fetchTopic({ topic, category, minStars }: (typeof TOPICS)[number]): Promise<RawResource[]> {
  const q = encodeURIComponent(`topic:${topic} stars:>${minStars}`)
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_TOPIC}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'OppIDX-ResourceScraper/1.0',
    },
  })
  if (!res.ok) throw new Error(`GitHub search (${topic}) responded ${res.status}`)

  const data = (await res.json()) as { items?: GithubSearchItem[] }
  const items = data.items ?? []

  return items
    // A repo with no description at all, or a description too short to say
    // anything real, isn't usable as a standalone resource listing.
    .filter(repo => (repo.description?.trim().length ?? 0) >= 15)
    .filter(repo => isEnglishEnough(repo.description ?? ''))
    .map((repo): RawResource => ({
      title: repo.full_name,
      url: repo.html_url,
      description: `${repo.description} ${repo.stargazers_count.toLocaleString()} stars on GitHub.`,
      category,
      audienceHint: 'GENERAL',
      sourceLabel: 'GitHub',
      // Existence and liveness already proven by this API call returning it —
      // skip the redundant reachability re-check the runner does for other
      // sources (see lib/resources/scraper/run.ts).
      preVerified: true,
    }))
}

export async function fetchGithubAwesomeLists(): Promise<RawResource[]> {
  const byFullName = new Map<string, RawResource>()

  for (let i = 0; i < TOPICS.length; i++) {
    try {
      const results = await fetchTopic(TOPICS[i])
      for (const r of results) {
        // A repo can carry multiple matching topics — first topic to surface
        // it wins the category, rather than creating duplicate candidates.
        if (!byFullName.has(r.title)) byFullName.set(r.title, r)
      }
    } catch (err) {
      console.error(`[resource-scraper] GitHub topic "${TOPICS[i].topic}" failed:`, err)
    }
    if (i < TOPICS.length - 1) await sleep(REQUEST_GAP_MS)
  }

  return [...byFullName.values()]
}
