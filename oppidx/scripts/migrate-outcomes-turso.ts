/**
 * Adds the outcome columns to SavedOpportunity and creates CollectionAlert
 * on the hosted Turso database.
 *
 * Same reason this exists as scripts/migrate-slugs-turso.ts: `.env` sets
 * DATABASE_URL="file:./dev.db" for local work while the app connects to
 * Turso via TURSO_DATABASE_URL from `.env.local` (see lib/db.ts), so the
 * Prisma CLI silently migrates the local SQLite file and leaves production
 * untouched. This reads `.env.local` explicitly.
 *
 * Purely additive and idempotent — every statement is guarded, no existing
 * column is altered, no row is written or deleted. Safe to re-run.
 *
 * Usage: npx tsx scripts/migrate-outcomes-turso.ts [--dry-run]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

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

// ADD COLUMN has no IF NOT EXISTS in SQLite, so each is guarded by a
// PRAGMA check instead of a swallowed error — a swallowed error would also
// hide a genuine failure (locked db, bad permissions) as "already applied".
const NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'outcome',      ddl: 'ALTER TABLE SavedOpportunity ADD COLUMN outcome TEXT' },
  { name: 'outcomeAt',    ddl: 'ALTER TABLE SavedOpportunity ADD COLUMN outcomeAt DATETIME' },
  { name: 'outcomeNote',  ddl: 'ALTER TABLE SavedOpportunity ADD COLUMN outcomeNote TEXT' },
  { name: 'shareConsent', ddl: 'ALTER TABLE SavedOpportunity ADD COLUMN shareConsent BOOLEAN NOT NULL DEFAULT 0' },
]

const STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS SavedOpportunity_outcome_idx ON SavedOpportunity(outcome)',
  `CREATE TABLE IF NOT EXISTS CollectionAlert (
     id TEXT NOT NULL PRIMARY KEY,
     subscriberId TEXT NOT NULL,
     collectionSlug TEXT NOT NULL,
     createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     lastNotifiedAt DATETIME
   )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS CollectionAlert_subscriberId_collectionSlug_key ON CollectionAlert(subscriberId, collectionSlug)',
  'CREATE INDEX IF NOT EXISTS CollectionAlert_subscriberId_idx ON CollectionAlert(subscriberId)',
  'CREATE INDEX IF NOT EXISTS CollectionAlert_collectionSlug_idx ON CollectionAlert(collectionSlug)',
]

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = loadEnvLocal()
  if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL missing from .env.local')

  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  const info = await db.execute('PRAGMA table_info(SavedOpportunity)')
  const existing = new Set(info.rows.map(r => String(r.name)))
  console.log(`[migrate] SavedOpportunity columns: ${[...existing].join(', ')}`)

  for (const col of NEW_COLUMNS) {
    if (existing.has(col.name)) {
      console.log(`[migrate] ${col.name} already present — skipping`)
      continue
    }
    if (dryRun) {
      console.log(`[migrate] DRY RUN — would: ${col.ddl}`)
    } else {
      await db.execute(col.ddl)
      console.log(`[migrate] added ${col.name}`)
    }
  }

  for (const sql of STATEMENTS) {
    const label = sql.trim().split('\n')[0].slice(0, 72)
    if (dryRun) {
      console.log(`[migrate] DRY RUN — would: ${label}…`)
    } else {
      await db.execute(sql)
      console.log(`[migrate] ok: ${label}…`)
    }
  }

  if (dryRun) {
    console.log('[migrate] DRY RUN — nothing written')
    return
  }

  const after = await db.execute('PRAGMA table_info(SavedOpportunity)')
  const cols = after.rows.map(r => String(r.name))
  const missing = NEW_COLUMNS.filter(c => !cols.includes(c.name)).map(c => c.name)
  const alerts = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='CollectionAlert'")
  console.log(`[migrate] done. missing columns: ${missing.length ? missing.join(', ') : 'none'}; CollectionAlert exists: ${alerts.rows.length === 1}`)
}

main().catch(e => { console.error(e); process.exit(1) })
