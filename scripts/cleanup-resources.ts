/**
 * One-time cleanup pass for scraped resources added before the GitHub
 * source had an English-language / description-quality filter (see
 * lib/resources/scraper/sources/github.ts) — soft-deletes existing rows
 * that wouldn't pass today's bar, so "very very clean" applies
 * retroactively, not just going forward.
 *
 *   npx ts-node scripts/cleanup-resources.ts        (dry run, lists only)
 *   npx ts-node scripts/cleanup-resources.ts --apply (soft-deletes)
 */

import { prisma } from '../lib/db'

const NON_LATIN_SCRIPT = /[Ѐ-ӿ؀-ۿ぀-ヿ一-鿿가-힯ऀ-ॿ]/g

function isEnglishEnough(text: string): boolean {
  const matches = text.match(NON_LATIN_SCRIPT)
  return (matches?.length ?? 0) <= 5
}

async function main() {
  const apply = process.argv.includes('--apply')

  const scraped = await prisma.resource.findMany({
    where: { source: 'scraped', deletedAt: null },
    select: { id: true, title: true, description: true },
  })

  const bad = scraped.filter(r => !isEnglishEnough(r.description) || r.description.trim().length < 15)

  console.log(`${scraped.length} scraped resources checked, ${bad.length} fail today's quality bar.`)
  bad.forEach(r => console.log(`  - ${r.title}: ${r.description.slice(0, 80)}`))

  if (!apply) {
    console.log('\nDry run only — rerun with --apply to soft-delete these.')
    return
  }

  for (const r of bad) {
    await prisma.resource.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
  }
  console.log(`\nSoft-deleted ${bad.length} resources.`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
