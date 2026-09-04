/**
 * Bulk-imports your existing offline opportunity list into the database.
 *
 * Drop your list at data/opportunities-import.json as an array of objects:
 * [
 *   {
 *     "title": "Google STEP Internship",
 *     "description": "...",
 *     "url": "https://...",
 *     "org": "Google",
 *     "audience": "STUDENT",          // STUDENT | EARLY_CAREER | FOUNDER | GENERAL
 *     "eligibility": "Who can actually apply",
 *     "prepResources": "How to prepare",
 *     "difficulty": "Medium",         // Easy | Medium | Hard
 *     "tags": "remote,paid,engineering",
 *     "location": "Remote",
 *     "compType": "Paid",
 *     "sourceUrl": "https://..."      // optional, where you found/verified it
 *   },
 *   ...
 * ]
 *
 * Everything imported this way is tagged source: "user-provided" and
 * verified: true immediately, since it's your own vetted list.
 *
 *   npx ts-node scripts/seed-opportunities.ts
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '../lib/db'
import { inferGeo } from '../lib/scraper/geo'
import { newSlug } from '../lib/slug'

const IMPORT_FILE = join(__dirname, '..', 'data', 'opportunities-import.json')
const VALID_AUDIENCES = ['STUDENT', 'EARLY_CAREER', 'FOUNDER', 'GENERAL']
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard']

async function main() {
  if (!existsSync(IMPORT_FILE)) {
    console.error(`No import file found at ${IMPORT_FILE}. Create it first — see the comment at the top of this script for the expected shape.`)
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(IMPORT_FILE, 'utf8'))
  if (!Array.isArray(raw)) {
    console.error('Import file must contain a JSON array.')
    process.exit(1)
  }

  let imported = 0
  let skipped = 0

  for (const [i, entry] of raw.entries()) {
    if (!entry.title || !entry.description || !entry.url || !VALID_AUDIENCES.includes(entry.audience)) {
      console.warn(`Skipping entry ${i}: missing title/description/url or invalid audience.`)
      skipped++
      continue
    }

    const location = entry.location ? String(entry.location).trim() : null
    const geo = inferGeo(location)

    await prisma.opportunity.create({
      data: {
        title: String(entry.title).trim(),
        slug: newSlug({ title: String(entry.title).trim(), org: entry.org ? String(entry.org).trim() : null }),
        description: String(entry.description).trim(),
        url: String(entry.url).trim(),
        org: entry.org ? String(entry.org).trim() : null,
        audience: entry.audience,
        eligibility: entry.eligibility ? String(entry.eligibility).trim() : '',
        prepResources: entry.prepResources ? String(entry.prepResources).trim() : '',
        difficulty: VALID_DIFFICULTIES.includes(entry.difficulty) ? entry.difficulty : 'Medium',
        tags: entry.tags ? String(entry.tags).trim() : '',
        location,
        region: geo.region,
        country: geo.country,
        compType: entry.compType ? String(entry.compType).trim() : null,
        verified: true,
        source: 'user-provided',
        sourceUrl: entry.sourceUrl ? String(entry.sourceUrl).trim() : null,
      },
    })
    imported++
  }

  console.log(`\n✅ Imported ${imported} opportunities (${skipped} skipped).`)
  await prisma.$disconnect()
}

main()
