/**
 * Wraps a list query that the site can survive without.
 *
 * Three surfaces prerender from live data at build time — the /collections,
 * /companies and /regions index pages, plus the `generateStaticParams` of
 * their `[slug]` routes and the sitemap. If any of those queries throws,
 * Next aborts the entire build with "Export encountered an error", which is
 * what has been failing every Vercel *preview* deployment: previews don't
 * inherit environment variables scoped to Production, so TURSO_DATABASE_URL
 * is absent, lib/db.ts falls back to a local SQLite file that doesn't exist
 * in the build container, and Prisma throws. Production builds have the
 * variable and are unaffected — which is exactly why the site deploys fine
 * while every preview sends a failure email.
 *
 * Returning `[]` is correct rather than a fudge. These routes keep Next's
 * default `dynamicParams: true`, so a slug that wasn't prerendered is simply
 * rendered on demand; the index pages already render an empty state when
 * there's nothing to list. The site behaves identically, with fewer pages
 * baked ahead of time. It also matches the precedent already set in
 * app/sitemap.ts, which returns [] for events when Supabase isn't
 * configured rather than taking the sitemap down with it.
 *
 * Never silent: it logs loudly, because "why did production stop
 * prerendering 120 company pages" has to be answerable from a build log.
 */
export async function listOrEmpty<T>(label: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load()
  } catch (err) {
    console.error(
      `[oppidx] ${label}: database unreachable — returning an empty list instead of failing. ` +
      `Expected in a Vercel preview (no Production env vars); in production this means ` +
      `something is genuinely wrong.`,
      err instanceof Error ? err.message : err
    )
    return []
  }
}
