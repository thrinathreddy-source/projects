/**
 * One-off backfill: addressRegion and employmentType for every existing
 * opportunity that predates these fields (see lib/scraper/normalize.ts —
 * every new listing gets them at ingestion time now). Purely re-derives
 * from data already truthfully stored on the row (location, title, tags,
 * description) using the exact same deterministic, no-AI extraction rules
 * new listings go through — no external network calls, no guessing beyond
 * what the text already says. Never touches salaryMin/salaryMax/
 * salaryCurrency: those are only ever set from a source's own disclosed
 * figure at ingestion time (see adzuna.ts), and there's no honest way to
 * retroactively invent one for a row that didn't come with it.
 *
 * Usage: npx ts-node scripts/backfill-jobposting-fields.ts
 */
import { prisma } from '../lib/db'
import { extractAddressRegion } from '../lib/scraper/geo'

// Duplicated in miniature from lib/scraper/normalize.ts's
// inferEmploymentType — no raw source hint is available for rows already
// in the database (that only ever existed transiently at ingestion time),
// so this backfill only ever uses the text-inference half of that function.
const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/\bintern(ship)?\b/i, 'INTERN'],
  [/\bvolunteer\b/i, 'VOLUNTEER'],
  [/\b(contract|contractor|freelance)\b/i, 'CONTRACTOR'],
  [/\btemporary\b/i, 'TEMPORARY'],
  [/\bpart[- ]time\b/i, 'PART_TIME'],
  [/\bfull[- ]time\b/i, 'FULL_TIME'],
]

function inferEmploymentTypeFromText(text: string): string | null {
  for (const [pattern, type] of EMPLOYMENT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type
  }
  return null
}

async function main() {
  const targets = await prisma.opportunity.findMany({
    where: {
      deletedAt: null,
      OR: [{ addressRegion: null }, { employmentType: null }],
    },
    select: { id: true, title: true, description: true, tags: true, location: true },
  })

  console.log(`Backfilling addressRegion/employmentType for ${targets.length} opportunities…`)

  let regionFilled = 0
  let typeFilled = 0

  for (const opp of targets) {
    const text = `${opp.title} ${opp.tags} ${opp.description}`
    const addressRegion = extractAddressRegion(opp.location)
    const employmentType = inferEmploymentTypeFromText(text)

    const data: Record<string, string> = {}
    if (addressRegion) { data.addressRegion = addressRegion; regionFilled++ }
    if (employmentType) { data.employmentType = employmentType; typeFilled++ }

    if (Object.keys(data).length > 0) {
      await prisma.opportunity.update({ where: { id: opp.id }, data })
    }
  }

  console.log(`\nDone. ${regionFilled} got an addressRegion, ${typeFilled} got an employmentType, out of ${targets.length} checked.`)
  console.log(`(The rest genuinely have no US "City, ST" location text or employment-type wording to derive from — left null rather than guessed.)`)
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
