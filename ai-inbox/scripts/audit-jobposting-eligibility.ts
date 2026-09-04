/**
 * Reports how many live listings carry JobPosting markup before and after the
 * title screen in lib/seo/jobPosting.ts, and prints what changes.
 *
 * Read-only: no writes, no external calls. Run it before and after touching
 * the gate, so a change to what this site declares to Google is a measured
 * number rather than an assumption.
 *
 * Reads `.env.local` explicitly for the same reason the migrate-*-turso
 * scripts do: `.env` sets DATABASE_URL="file:./dev.db" for local work while
 * the app connects to Turso via TURSO_DATABASE_URL (see lib/db.ts), so
 * without this the audit silently measures a near-empty local SQLite file
 * and reports a confident, wrong number.
 *
 * Usage: npx tsx scripts/audit-jobposting-eligibility.ts [--list]
 */
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  let raw: string
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    console.warn('[audit] no .env.local — measuring whatever DATABASE_URL points at')
    return
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key]) continue
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
}

async function main() {
  loadEnvLocal()

  // Imported after the env is in place — lib/db.ts picks its adapter at module
  // load, so a static import would bind to the local file before this ran.
  const { prisma } = await import('../lib/db')
  const { isEligibleJobPosting, NON_JOB_TAGS } = await import('../lib/seo/jobPosting')

  /** The rule as it stood before the title screen: tags only. */
  const eligibleTagsOnly = (o: { tags: string; org: string | null; location: string | null; country: string }) => {
    const tags = o.tags.toLowerCase()
    return Boolean(o.org) && Boolean(o.location || o.country) && !NON_JOB_TAGS.some(t => tags.includes(t))
  }

  const listAll = process.argv.includes('--list')
  const rows = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null },
    select: { id: true, slug: true, title: true, tags: true, org: true, location: true, country: true },
  })

  const before = rows.filter(eligibleTagsOnly)
  const after = rows.filter(isEligibleJobPosting)
  const afterIds = new Set(after.map(r => r.id))
  const beforeIds = new Set(before.map(r => r.id))
  const dropped = before.filter(r => !afterIds.has(r.id))
  const added = after.filter(r => !beforeIds.has(r.id))

  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(2)}%`
  console.log(`live verified listings:        ${rows.length}`)
  console.log(`JobPosting before (tags only): ${before.length}  (${pct(before.length)})`)
  console.log(`JobPosting after  (+ title):   ${after.length}  (${pct(after.length)})`)
  console.log(`no longer marked:              ${dropped.length}  (${pct(dropped.length)})`)
  console.log(`newly marked:                  ${added.length}`)

  const byWord: Record<string, number> = {}
  for (const r of dropped) {
    const w = NON_JOB_TAGS.find(x => new RegExp(`\\b${x}s?\\b`, 'i').test(r.title)) ?? '?'
    byWord[w] = (byWord[w] ?? 0) + 1
  }
  console.log('\nreason (word in title):', JSON.stringify(byWord))

  console.log('\nlistings that will stop claiming to be jobs:')
  for (const r of (listAll ? dropped : dropped.slice(0, 30))) {
    console.log(`  ${r.title.slice(0, 90)}`)
  }
  if (!listAll && dropped.length > 30) console.log(`  … and ${dropped.length - 30} more (--list to see all)`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
