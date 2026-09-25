/**
 * One-off backfill: the `slug` column (see lib/slug.ts) for opportunities
 * that predate it. Every new listing gets one at write time now — the
 * scraper (lib/scraper/run.ts), the admin create route, and the public
 * submission route all set it.
 *
 * Pure computation over columns already on the row: no network calls, no
 * cost, safe to run unbounded. It only ever writes rows whose slug is
 * currently null, so re-running it is a no-op rather than a churn of new
 * URLs — important, because a slug that changes after it has been shared
 * breaks a link someone already sent.
 *
 * Usage: npx tsx scripts/backfill-slugs.ts [limit]
 * Defaults to every row missing a slug; pass a number to bound it.
 */
import { prisma } from '../lib/db'
import { buildSlug } from '../lib/slug'

async function main() {
  const limitArg = parseInt(process.argv[2] ?? '0', 10)
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined

  const targets = await prisma.opportunity.findMany({
    where: { slug: null },
    select: { id: true, title: true, org: true },
    orderBy: { addedAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  })

  console.log(`[backfill-slugs] ${targets.length} row(s) missing a slug.`)

  let written = 0
  let collided = 0

  for (const opp of targets) {
    // Seeded from the row's own cuid rather than randomly, so recomputing a
    // slug for an existing row always yields the same string — a slug that
    // changed on a re-run would break links already shared.
    const slug = buildSlug(opp, opp.id.slice(-6))
    try {
      await prisma.opportunity.update({ where: { id: opp.id }, data: { slug } })
      written++
    } catch {
      // The unique index rejected it — two rows produced the same slug,
      // which needs the same title, the same org, and the same last six
      // cuid characters. Falling back to the bare id keeps the row
      // addressable rather than leaving it null forever.
      try {
        await prisma.opportunity.update({ where: { id: opp.id }, data: { slug: opp.id } })
        collided++
      } catch (e) {
        console.error(`[backfill-slugs] could not slug ${opp.id}:`, e instanceof Error ? e.message : e)
      }
    }
  }

  console.log(`[backfill-slugs] wrote ${written}, fell back to id for ${collided}.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
