import { prisma } from '@/lib/db'
import { RESOURCE_SOURCES } from './sources'
import { checkUrlReachable, normalizeUrl, getExistingNormalizedUrls } from '@/lib/resources/verify'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import type { RawResource } from './types'

interface SourceStats {
  fetched: number
  added: number
  error: string | null
}

export interface RunResult {
  startedAt: Date
  finishedAt: Date
  added: number
  perSource: Record<string, SourceStats>
}

/** Live-reachability checks bounded together, mirroring the concurrency cap
 * app/api/cron/link-health/route.ts uses for the same kind of per-item
 * network call under the same kind of wall-clock ceiling. */
const REACHABILITY_CONCURRENCY = 8

/**
 * One full resource-scraper pass: fetch every source, then run each
 * candidate through the exact same gate a public submission goes through
 * (live-link reachability + duplicate check, lib/resources/verify.ts) before
 * creating it — scraped resources are held to the same "only verified
 * resources get added" bar, not a lower one.
 */
export async function runResourceScrapePass(): Promise<RunResult> {
  const startedAt = new Date()
  const perSource: Record<string, SourceStats> = {}
  let added = 0

  const seen = await getExistingNormalizedUrls()

  for (const source of RESOURCE_SOURCES) {
    const stats: SourceStats = { fetched: 0, added: 0, error: null }

    try {
      const raws = await source.fetch()
      stats.fetched = raws.length

      // Not already on the board, and deduped against siblings from this same
      // source in this same pass (first occurrence wins) — a Map keyed by the
      // normalized URL, same pattern lib/resources/scraper/sources/github.ts
      // already uses to dedupe a repo appearing under several topics. This has
      // to happen before the reachability checks run concurrently below: two
      // candidates sharing a key would otherwise both pass their checks and
      // both attempt to create a Resource row, and Resource.url carries no
      // unique constraint in the schema to catch that at the database.
      const candidates = new Map<string, RawResource>()
      for (const raw of raws) {
        const key = normalizeUrl(raw.url)
        if (!seen.has(key) && !candidates.has(key)) candidates.set(key, raw)
      }

      // The reachability check is the slow part — up to two 6s-timeout fetches
      // per candidate (lib/resources/verify.ts) — and this pass runs inside a
      // route with a 60s wall-clock ceiling (maxDuration in
      // app/api/cron/scrape-resources/route.ts) that GitHub's deliberately-
      // paced topic search alone already spends most of. Checking candidates
      // one at a time summed every candidate's latency into that same budget;
      // a run with enough new Reddit candidates needing a check could and did
      // push the whole pass past 60s, which the platform reports as a plain
      // failure with no detail — indistinguishable from every other kind of
      // crash. Bounded concurrency caps the wall time at roughly
      // (candidates / REACHABILITY_CONCURRENCY) check-lengths instead of
      // (candidates × check-length).
      const entries = [...candidates.entries()]
      const verdicts = await mapWithConcurrency(entries, REACHABILITY_CONCURRENCY, async ([, raw]) =>
        raw.preVerified ? true : (await checkUrlReachable(raw.url)).ok
      )

      // Insertion stays serial and in source order — one Prisma round trip at
      // a time, same as before. The check above was the actual bottleneck;
      // parallelizing writes too would only add write contention for no
      // wall-clock benefit worth the added complexity.
      for (let i = 0; i < entries.length; i++) {
        if (!verdicts[i]) continue
        const [key, raw] = entries[i]

        await prisma.resource.create({
          data: {
            title: raw.title.trim().slice(0, 300),
            description: raw.description.trim().slice(0, 600),
            url: raw.url,
            category: raw.category,
            audience: raw.audienceHint,
            verified: true,
            source: 'scraped',
          },
        })
        seen.add(key)
        stats.added++
        added++
      }
    } catch (err) {
      stats.error = err instanceof Error ? err.message : String(err)
      console.error(`[resource-scraper] source "${source.name}" failed:`, stats.error)
    }

    perSource[source.name] = stats
  }

  const finishedAt = new Date()

  await prisma.resourceScrapeRun
    .create({ data: { startedAt, finishedAt, added, details: JSON.stringify(perSource) } })
    .catch(err => console.error('[resource-scraper] failed to record ResourceScrapeRun:', err))

  console.log(`[resource-scraper] pass finished — added ${added} new resources across ${RESOURCE_SOURCES.length} sources`)

  return { startedAt, finishedAt, added, perSource }
}
