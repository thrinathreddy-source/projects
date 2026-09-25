import { prisma } from '@/lib/db'
import type { MatchInput } from '@/lib/collectionDefs'

/**
 * A cached, minimal projection of the board, for anything that needs to run
 * `CollectionDef.match` over every listing.
 *
 * This exists because collection pages were making the build fall over.
 * Every one of them triggered three separate full-table reads:
 * `generateMetadata` → `resolveCollectionDef` → `getGeneratedCombos`, then
 * the page body doing the same again, then `getCollectionOpportunities`.
 * Each read pulled every column of every verified row — including
 * `description`, which is the largest field on the table — at roughly 3.0 MB
 * and one second per call against Turso.
 *
 * Across ~115 collection pages that is ~345 reads and ~1 GB of transfer per
 * build, run by nine parallel workers all hammering the same remote
 * database. Under that contention individual pages routinely crossed Next's
 * 60-second per-page export timeout, and after three attempts the whole
 * build aborted:
 *
 *   Failed to build /collections/[slug]/page: /collections/remote-ai-and-
 *   machine-learning after 3 attempts. Export encountered an error.
 *
 * That's the intermittency — whether a given build survived depended on
 * network conditions and how many rows the hourly scrape had added since the
 * last one, so builds passed and failed on what looked like a coin flip.
 *
 * Two changes fix it. First, only the columns `match` actually reads are
 * selected, which drops the payload by roughly an order of magnitude.
 * Second, the result is memoised per process, so each build worker performs
 * one read instead of dozens.
 */
export interface PoolRow extends MatchInput {
  id: string
  /** Not read by any matcher — carried so app/sitemap.ts can derive a real
   * `lastModified` for each collection (the newest listing it matches) rather
   * than stamping `new Date()` on every entry. One extra scalar column on a
   * projection that already excludes the expensive ones. */
  addedAt: Date
}

/**
 * Short by design. Collection pages are ISR with `revalidate = 3600`, so
 * this is already an order of magnitude fresher than the page cache it
 * feeds — it exists to collapse the burst of reads within a single build or
 * request, not to serve stale data. A build finishes well inside it; a live
 * request gets data at most a minute old.
 */
const TTL_MS = 60_000

let cached: { at: number; rows: PoolRow[] } | null = null
/** Shared so nine workers starting at once issue one query, not nine. */
let inflight: Promise<PoolRow[]> | null = null

export async function matchPool(): Promise<PoolRow[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows
  if (inflight) return inflight

  inflight = prisma.opportunity
    .findMany({
      where: { verified: true, deletedAt: null },
      // Exactly the MatchInput fields, plus id. Deliberately not `select: *` —
      // `description` alone is most of the payload and no matcher reads it.
      select: {
        id: true, audience: true, tags: true, difficulty: true,
        location: true, region: true, country: true, compType: true,
        addedAt: true,
      },
      orderBy: { addedAt: 'desc' },
    })
    .then(rows => {
      cached = { at: Date.now(), rows }
      return rows
    })
    .catch((err: unknown) => {
      // An unreachable database degrades the collection pages to empty rather
      // than aborting the build, matching lib/buildParams.ts and the
      // Supabase handling already in app/sitemap.ts. This is what a Vercel
      // preview looks like: previews don't inherit Production-scoped
      // environment variables, so TURSO_DATABASE_URL is absent there.
      //
      // Deliberately NOT written to `cached` — a failure must not be served
      // for the next TTL_MS. The next caller retries, so a brief blip costs
      // one render rather than a minute of empty pages.
      console.error(
        '[oppidx] matchPool: database unreachable — collection pages will render empty. ' +
        'Expected in a Vercel preview; in production this means something is genuinely wrong.',
        err instanceof Error ? err.message : err
      )
      return [] as PoolRow[]
    })
    .finally(() => { inflight = null })

  return inflight
}

/** Test/script escape hatch — nothing in the app calls this. */
export function clearMatchPool(): void {
  cached = null
}
