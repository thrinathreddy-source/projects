/**
 * Adds Opportunity.validThrough / deadlineSource to Turso and backfills them
 * by reading each existing listing's own description text.
 *
 * Same reason this isn't `prisma db push` as the other migrate-*-turso
 * scripts: the Prisma CLI reads DATABASE_URL from `.env` (a local SQLite
 * file), while the app talks to Turso via TURSO_DATABASE_URL from `.env.local`.
 *
 * Nothing here invents a date. Every value written was stated explicitly in
 * the listing's own text next to a phrase that means "applications shut on
 * this date" — see lib/scraper/deadline.ts, which also explains why bare dates
 * and ambiguous numeric forms are refused. Coverage will be a minority of the
 * board, and that is the correct outcome: validThrough is a recommended
 * property read per page, so listings that gain one benefit and the rest are
 * exactly as they were.
 *
 * Idempotent and re-runnable. --dry-run reports coverage and prints samples
 * without writing, which is worth doing first: it's the only cheap way to eyeball
 * whether the extraction rules are behaving on real data.
 *
 * Usage:
 *   npx tsx scripts/migrate-deadlines-turso.ts --dry-run
 *   npx tsx scripts/migrate-deadlines-turso.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { extractDeadline } from '../lib/scraper/deadline'

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

const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'validThrough', ddl: 'ALTER TABLE Opportunity ADD COLUMN validThrough DATETIME' },
  { name: 'deadlineSource', ddl: 'ALTER TABLE Opportunity ADD COLUMN deadlineSource TEXT' },
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = loadEnvLocal()
  if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL missing from .env.local')

  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  const info = await db.execute('PRAGMA table_info(Opportunity)')
  const existing = new Set(info.rows.map(r => String(r.name)))

  for (const { name, ddl } of COLUMNS) {
    if (existing.has(name)) {
      console.log(`[migrate] column ${name} already present`)
    } else if (dryRun) {
      console.log(`[migrate] DRY RUN — would: ${ddl}`)
    } else {
      await db.execute(ddl)
      console.log(`[migrate] added column ${name}`)
    }
  }

  // Description plus the two other free-text fields a deadline is commonly
  // written into on scholarship and fellowship listings.
  const rows = await db.execute(
    'SELECT id, title, org, description, eligibility, prepResources FROM Opportunity WHERE deletedAt IS NULL'
  )
  console.log(`[migrate] scanning ${rows.rows.length} live listing(s)`)

  const now = new Date()
  const found: { id: string; when: Date; title: string; org: string }[] = []

  for (const r of rows.rows) {
    const text = [str(r.description), str(r.eligibility), str(r.prepResources)].join('\n')
    const when = extractDeadline(text, now)
    if (when) found.push({ id: str(r.id), when, title: str(r.title), org: str(r.org) })
  }

  const pct = ((found.length / Math.max(rows.rows.length, 1)) * 100).toFixed(1)
  console.log(`[migrate] deadlines found: ${found.length} of ${rows.rows.length} (${pct}%)`)
  console.log('[migrate] sample:')
  for (const f of found.slice(0, 12)) {
    console.log(`  ${f.when.toISOString().slice(0, 10)}  ${f.title.slice(0, 58)}${f.org ? ` @ ${f.org}` : ''}`)
  }

  if (dryRun) {
    console.log('[migrate] DRY RUN — nothing written')
    return
  }

  const BATCH = 100
  const statements = found.map(f => ({
    sql: "UPDATE Opportunity SET validThrough = ?, deadlineSource = 'description' WHERE id = ?",
    args: [f.when.toISOString(), f.id] as (string | null)[],
  }))
  for (let i = 0; i < statements.length; i += BATCH) {
    await db.batch(statements.slice(i, i + BATCH), 'write')
    console.log(`  …written ${Math.min(i + BATCH, statements.length)}/${statements.length}`)
  }

  const check = await db.execute(
    'SELECT COUNT(*) AS n FROM Opportunity WHERE deletedAt IS NULL AND validThrough IS NOT NULL'
  )
  console.log(`[migrate] listings now carrying a deadline: ${check.rows[0].n}`)

  // Must be zero: a validThrough already in the past would remove a live
  // listing from Google Jobs. The extractor refuses to return one, so this is
  // a check that the extractor is behaving, not a cleanup step.
  const stale = await db.execute(
    "SELECT COUNT(*) AS n FROM Opportunity WHERE deletedAt IS NULL AND validThrough IS NOT NULL AND validThrough <= datetime('now')"
  )
  console.log(`[migrate] already-past deadlines written (must be 0): ${stale.rows[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
