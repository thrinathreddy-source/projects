/**
 * Adds Opportunity.lastCheckedAt / deadStrikes to the hosted Turso database.
 *
 * Same reason this isn't `prisma db push` as every other migrate-*-turso
 * script here: the Prisma CLI reads DATABASE_URL from `.env`, which points at
 * a local SQLite file, while the app talks to Turso via TURSO_DATABASE_URL
 * from `.env.local` (see lib/db.ts). A plain `db push` would migrate the local
 * file and leave production untouched.
 *
 * Additive and idempotent: each ADD COLUMN is skipped if the column already
 * exists, and the index is created IF NOT EXISTS. No existing column is
 * altered and no row is deleted or rewritten — every existing listing starts
 * with a null lastCheckedAt, which is exactly what the link-health cron
 * queues first.
 *
 * Usage: npx tsx scripts/migrate-link-health-turso.ts [--dry-run]
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

const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'lastCheckedAt', ddl: 'ALTER TABLE Opportunity ADD COLUMN lastCheckedAt DATETIME' },
  // NOT NULL with a default is safe on ADD COLUMN in SQLite because the
  // default backfills every existing row in place.
  { name: 'deadStrikes', ddl: 'ALTER TABLE Opportunity ADD COLUMN deadStrikes INTEGER NOT NULL DEFAULT 0' },
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
      continue
    }
    if (dryRun) {
      console.log(`[migrate] DRY RUN — would: ${ddl}`)
    } else {
      await db.execute(ddl)
      console.log(`[migrate] added column ${name}`)
    }
  }

  if (dryRun) {
    console.log('[migrate] DRY RUN — nothing written')
    return
  }

  // The cron orders by lastCheckedAt ASC NULLS FIRST over a ~2,700-row table
  // every night; one index keeps that from being a full scan each time.
  await db.execute('CREATE INDEX IF NOT EXISTS Opportunity_lastCheckedAt_idx ON Opportunity(lastCheckedAt)')
  console.log('[migrate] ensured index Opportunity_lastCheckedAt_idx')

  const pending = await db.execute('SELECT COUNT(*) AS n FROM Opportunity WHERE deletedAt IS NULL AND lastCheckedAt IS NULL')
  console.log(`[migrate] listings queued for a first link check: ${pending.rows[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
