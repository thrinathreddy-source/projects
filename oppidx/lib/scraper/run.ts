import { prisma } from '@/lib/db'
import { SOURCES } from './sources'
import { normalize } from './normalize'
import { normalizeUrl } from './util'
import { contentKey, urlKey } from './dedupe'
import { resolveDeadline } from './deadline'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { fetchOgMedia } from '@/lib/ogImage'
// Templated (non-AI) for now — no OpenAI credit as of writing. Swap back
// to `import { writeOpportunitySummary } from './summarize.ai'` (and call
// it with (title, org, description) instead) once there's budget again;
// see lib/scraper/summarize.ts's own comment for the full swap-back note.
import { templateOpportunitySummary } from './summarize'
import { newSlug } from '@/lib/slug'

interface SourceStats {
  fetched: number
  added: number
  /** Listings rejected by the UNIQUE urlKey index — recorded rather than
   * swallowed, so a source that suddenly starts colliding heavily shows up in
   * the ScrapeRun details instead of just looking like it stopped finding
   * anything new. */
  deduped: number
  error: string | null
}

export interface RunResult {
  startedAt: Date
  finishedAt: Date
  added: number
  perSource: Record<string, SourceStats>
}

/** One full pass: fetch every source, skip URLs already in the DB, classify and insert the rest. */
export async function runScrapePass(): Promise<RunResult> {
  const startedAt = new Date()
  const perSource: Record<string, SourceStats> = {}
  let added = 0

  for (const source of SOURCES) {
    const stats: SourceStats = { fetched: 0, added: 0, deduped: 0, error: null }

    try {
      const listings = await source.fetch()
      stats.fetched = listings.length

      for (const raw of listings) {
        const url = normalizeUrl(raw.url)

        // Identity check, not a string comparison. The old version matched on
        // `url` exactly, which meant any source whose links carry a rotating
        // token (Adzuna's `se=`) re-inserted the same listing on every hourly
        // pass — one ad reached 33 live pages that way. See
        // lib/scraper/dedupe.ts.
        //
        // Deliberately urlKey only. contentKey is computed and stored below,
        // but it never blocks an insert: several employers here post multiple
        // distinct requisitions under one title in one location, and skipping
        // on that fingerprint would silently drop real listings.
        const key = urlKey(raw.url)
        const fingerprint = contentKey(raw)
        const exists = await prisma.opportunity.findFirst({
          where: {
            OR: [
              { urlKey: key },
              // Pre-migration rows may still have a null urlKey; keep matching
              // them on the raw URL so a backfill gap can't reopen the hole.
              { url },
            ],
          },
          select: { id: true },
        })
        if (exists) continue

        const normalized = normalize(raw)
        // Prefers a source-disclosed deadline, falls back to an explicit
        // phrase in the listing's own text, and returns null for everything
        // else — see lib/scraper/deadline.ts.
        const deadline = resolveDeadline({ deadlineHint: raw.deadlineHint, description: normalized.description })
        const { imageUrl, videoUrl } = await fetchOgMedia(url)
        const summary = templateOpportunitySummary({
          org: raw.org ?? null,
          location: raw.location ?? null,
          audience: normalized.audience,
          employmentType: normalized.employmentType,
          compType: normalized.compType,
        })

        try {
          await prisma.opportunity.create({
            data: {
              title: raw.title.trim(),
              slug: newSlug({ title: raw.title.trim(), org: raw.org ?? null }),
              description: normalized.description,
              summary,
              url,
              urlKey: key,
              contentKey: fingerprint,
              org: raw.org ?? null,
              audience: normalized.audience,
              eligibility: normalized.eligibility,
              prepResources: normalized.prepResources,
              difficulty: normalized.difficulty,
              tags: normalized.tags,
              location: raw.location ?? null,
              region: normalized.region,
              country: normalized.country,
              compType: normalized.compType,
              addressRegion: normalized.addressRegion || null,
              validThrough: deadline,
              deadlineSource: deadline ? (raw.deadlineHint ? 'source' : 'description') : null,
              employmentType: normalized.employmentType,
              // Salary is the one JobPosting field never derived here — only
              // ever the source's own disclosed figure, passed straight
              // through from RawListing (see lib/scraper/types.ts).
              salaryMin: raw.salaryMin ?? null,
              salaryMax: raw.salaryMax ?? null,
              salaryCurrency: raw.salaryCurrency ?? null,
              imageUrl,
              videoUrl,
              verified: true,
              featured: false,
              source: 'scraped',
              sourceUrl: raw.sourceUrl,
            },
          })
          stats.added++
          added++
        } catch (err) {
          // The UNIQUE index on urlKey is the last line of defence, and it is
          // meant to be hit occasionally: two sources can carry the same
          // posting inside a single pass, where neither is in the DB yet when
          // the check above runs. That is a successful de-duplication, not a
          // failure — skip the row and keep the pass going. Anything else
          // still propagates to the per-source error handler below.
          if (!isUniqueConstraintError(err)) throw err
          stats.deduped++
        }
      }
    } catch (err) {
      stats.error = err instanceof Error ? err.message : String(err)
      console.error(`[scraper] source "${source.name}" failed:`, stats.error)
    }

    perSource[source.name] = stats
  }

  const finishedAt = new Date()

  await prisma.scrapeRun
    .create({ data: { startedAt, finishedAt, added, details: JSON.stringify(perSource) } })
    .catch(err => console.error('[scraper] failed to record ScrapeRun:', err))

  console.log(`[scraper] pass finished — added ${added} new opportunities across ${SOURCES.length} sources`)

  return { startedAt, finishedAt, added, perSource }
}
