/**
 * Adds Opportunity.urlKey / contentKey / duplicateOfId to the hosted Turso
 * database, backfills them, and collapses the duplicate listings that the old
 * exact-URL dedupe check let in.
 *
 * Why this exists separately from `prisma db push`: `.env` sets
 * DATABASE_URL="file:./dev.db" for local work, while the app connects to
 * Turso via TURSO_DATABASE_URL from `.env.local` (see lib/db.ts). Prisma's
 * CLI reads the former, so a plain `db push` silently migrates the local
 * SQLite file and leaves the real database untouched. Same reasoning and same
 * shape as scripts/migrate-slugs-turso.ts.
 *
 * Safe to run repeatedly:
 *   - ADD COLUMN is skipped for any column that already exists.
 *   - The unique index on urlKey is created only AFTER duplicates have been
 *     collapsed, because it cannot be created while they exist.
 *   - Collapsing only ever touches rows that are still live (deletedAt IS
 *     NULL); a second run finds nothing left to do.
 *   - No row is ever hard-deleted. Losers are soft-deleted and stamped with
 *     duplicateOfId, which is what lets /opportunities/[id] 308 them onto the
 *     surviving URL instead of 404ing an already-indexed page.
 *
 * Which row survives: the oldest (lowest addedAt). It has been indexed
 * longest, is the one most likely to hold whatever inbound links exist, and
 * picking deterministically means a re-run can never flip the direction of a
 * redirect that has already been published.
 *
 * Usage:
 *   npx tsx scripts/migrate-dedupe-turso.ts --dry-run   # report only, writes nothing
 *   npx tsx scripts/migrate-dedupe-turso.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { contentKey, urlKey } from '../lib/scraper/dedupe'

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const str = (v: unknown): string => (v == null ? '' : String(v))

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = loadEnvLocal()
  if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL missing from .env.local')

  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  // ---- 1. columns -----------------------------------------------------

  const info = await db.execute('PRAGMA table_info(Opportunity)')
  const columns = new Set(info.rows.map(r => String(r.name)))

  for (const column of ['urlKey', 'contentKey', 'duplicateOfId']) {
    if (columns.has(column)) {
      console.log(`[migrate] column ${column} already present`)
      continue
    }
    if (dryRun) {
      console.log(`[migrate] DRY RUN — would ALTER TABLE Opportunity ADD COLUMN ${column} TEXT`)
    } else {
      await db.execute(`ALTER TABLE Opportunity ADD COLUMN ${column} TEXT`)
      console.log(`[migrate] added column ${column} TEXT`)
    }
  }

  // ---- 2. read every live row and compute its keys --------------------

  const rows = await db.execute(
    'SELECT id, url, title, org, location, addedAt, deletedAt FROM Opportunity WHERE deletedAt IS NULL'
  )
  console.log(`[migrate] ${rows.rows.length} live listing(s)`)

  interface Row { id: string; url: string; key: string; content: string | null; addedAt: string }
  const all: Row[] = rows.rows.map(r => ({
    id: str(r.id),
    url: str(r.url),
    key: urlKey(str(r.url)),
    content: contentKey({ title: str(r.title), org: r.org == null ? null : str(r.org), location: r.location == null ? null : str(r.location) }),
    addedAt: str(r.addedAt),
  }))

  // ---- 3. find duplicate clusters -------------------------------------

  // ONLY urlKey collapses. This is the unambiguous case: two rows pointing at
  // the same destination, reached through a rotating tracking token.
  //
  // contentKey deliberately does NOT collapse. Measured against this database
  // it would have soft-deleted 105 further rows, and inspection showed most
  // were real: Anduril, Twilio, MongoDB, PayPal and Mastercard each run
  // several distinct open requisitions under one title at one location, with
  // different ATS job ids in the URL. A handful were genuine (arbeitnow
  // re-slugs one job with a rotating numeric suffix), but not enough to
  // justify a rule that destroys real listings to tidy up near-duplicate
  // titles. Those clusters get reported below and in the weekly SEO cron for
  // a human to judge.
  const byUrlKey = new Map<string, Row[]>()
  for (const row of all) {
    const bucket = byUrlKey.get(row.key)
    if (bucket) bucket.push(row)
    else byUrlKey.set(row.key, [row])
  }

  /** Oldest first — the survivor is index 0 of every cluster. */
  const oldestFirst = (a: Row, b: Row) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : a.id < b.id ? -1 : 1)

  const collapse: { loser: string; survivor: string; via: string }[] = []
  const survivors: Row[] = []

  for (const bucket of byUrlKey.values()) {
    bucket.sort(oldestFirst)
    survivors.push(bucket[0])
    for (const loser of bucket.slice(1)) {
      collapse.push({ loser: loser.id, survivor: bucket[0].id, via: 'urlKey' })
    }
  }

  console.log(`[migrate] exact duplicates to collapse: ${collapse.length}`)
  console.log(`[migrate] listings after collapse: ${all.length - collapse.length}`)

  // The worst clusters, so the number above can be eyeballed against the real
  // board before anything is written.
  const clusterSizes = [...byUrlKey.values()].filter(b => b.length > 1).sort((a, b) => b.length - a.length)
  for (const cluster of clusterSizes.slice(0, 5)) {
    console.log(`  ${cluster.length}x  ${cluster[0].key.slice(0, 90)}`)
  }

  // Reported, never actioned — see the comment above byUrlKey.
  const byContentKey = new Map<string, Row[]>()
  for (const row of survivors) {
    if (!row.content) continue
    const bucket = byContentKey.get(row.content)
    if (bucket) bucket.push(row)
    else byContentKey.set(row.content, [row])
  }
  const contentClusters = [...byContentKey.values()].filter(b => b.length > 1)
  const contentExtras = contentClusters.reduce((n, c) => n + c.length - 1, 0)
  console.log(`[migrate] same-title/org/location clusters for review: ${contentClusters.length} (${contentExtras} extra rows) — NOT collapsed`)

  if (dryRun) {
    console.log('[migrate] DRY RUN — nothing written')
    return
  }

  // ---- 4. collapse ----------------------------------------------------

  // Batched — one round-trip per 100 rows rather than per row. Against a
  // remote Turso instance the difference is minutes.
  const BATCH = 100
  const runBatched = async (statements: { sql: string; args: (string | null)[] }[], label: string) => {
    for (let i = 0; i < statements.length; i += BATCH) {
      await db.batch(statements.slice(i, i + BATCH), 'write')
      console.log(`  …${label} ${Math.min(i + BATCH, statements.length)}/${statements.length}`)
    }
  }

  await runBatched(
    collapse.map(({ loser, survivor }) => ({
      sql: 'UPDATE Opportunity SET deletedAt = CURRENT_TIMESTAMP, duplicateOfId = ? WHERE id = ? AND deletedAt IS NULL',
      args: [survivor, loser],
    })),
    'collapsed',
  )
  console.log(`[migrate] collapsed ${collapse.length} duplicate(s)`)

  // ---- 5. backfill keys on what remains --------------------------------

  const losers = new Set(collapse.map(c => c.loser))
  const survivorRows = all.filter(r => !losers.has(r.id))
  await runBatched(
    survivorRows.map(row => ({
      sql: 'UPDATE Opportunity SET urlKey = ?, contentKey = ? WHERE id = ?',
      args: [row.key, row.content, row.id],
    })),
    'backfilled',
  )
  console.log(`[migrate] backfilled keys on ${survivorRows.length} row(s)`)

  // ---- 6. the constraint that stops this recurring ---------------------

  // Only safe now that the collapse above has removed the collisions. Name
  // matches what Prisma generates for `@unique`, so a later `prisma db push`
  // sees it as already-applied rather than trying to recreate it. SQLite
  // treats NULLs as distinct, so soft-deleted losers (whose urlKey is left
  // null) don't collide with their survivors.
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Opportunity_urlKey_key ON Opportunity(urlKey)')
  console.log('[migrate] ensured unique index Opportunity_urlKey_key')

  await db.execute('CREATE INDEX IF NOT EXISTS Opportunity_contentKey_idx ON Opportunity(contentKey)')
  console.log('[migrate] ensured index Opportunity_contentKey_idx')

  // ---- 7. verify -------------------------------------------------------

  const remaining = await db.execute(`
    SELECT COUNT(*) AS n FROM (
      SELECT urlKey FROM Opportunity WHERE deletedAt IS NULL AND urlKey IS NOT NULL
      GROUP BY urlKey HAVING COUNT(*) > 1
    )
  `)
  console.log(`[migrate] live urlKey collisions remaining: ${remaining.rows[0].n}`)

  const live = await db.execute('SELECT COUNT(*) AS n FROM Opportunity WHERE deletedAt IS NULL')
  console.log(`[migrate] live listings: ${live.rows[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
