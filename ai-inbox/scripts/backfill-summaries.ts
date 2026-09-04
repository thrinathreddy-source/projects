/**
 * One-off backfill: the `summary` field (see lib/scraper/summarize.ts) for
 * opportunities that predate it — every new listing gets one automatically
 * at ingestion time now (see lib/scraper/run.ts). Templated, not AI —
 * there's no OpenAI credit as of writing (see lib/scraper/summarize.ai.ts's
 * comment for the swap-back note); this uses the pure-templating sibling
 * instead, so it's free to run and doesn't need to wait on billing.
 *
 * Bounded by default, same reasoning as scripts/backfill-images.ts —
 * though since this makes no external calls at all (pure computation over
 * columns already on the row), there's no real reason not to run it
 * unbounded; pass a very high limit (or 0) to cover everything in one go.
 *
 * Usage: npx tsx scripts/backfill-summaries.ts [limit]
 * Defaults to the top 150 most-viewed opportunities missing a summary;
 * pass 0 for no limit (every row missing one).
 */
import { prisma } from '../lib/db'
import { templateOpportunitySummary } from '../lib/scraper/summarize'

async function main() {
  const limitArg = parseInt(process.argv[2] ?? '150', 10)
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined

  const targets = await prisma.opportunity.findMany({
    where: { summary: null, verified: true, deletedAt: null },
    orderBy: { viewCount: 'desc' },
    ...(limit ? { take: limit } : {}),
    select: { id: true, org: true, location: true, audience: true, employmentType: true, compType: true },
  })

  console.log(`Backfilling summaries for ${targets.length} opportunities…`)

  let filled = 0
  for (const opp of targets) {
    const summary = templateOpportunitySummary(opp)
    if (summary) {
      await prisma.opportunity.update({ where: { id: opp.id }, data: { summary } })
      filled++
    }
  }

  console.log(`\nDone. ${filled} of ${targets.length} got a summary.`)
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
