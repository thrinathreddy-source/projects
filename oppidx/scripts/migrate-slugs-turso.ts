/**
 * Adds Opportunity.slug to the hosted Turso database and backfills it.
 *
 * Why this exists separately from `prisma db push`: `.env` sets
 * DATABASE_URL="file:./dev.db" for local work, while the app connects to
 * Turso via TURSO_DATABASE_URL from `.env.local` (see lib/db.ts). Prisma's
 * CLI reads the former, so a plain `db push` silently migrates the local
 * SQLite file and leaves the real database untouched. This script reads
 * `.env.local` explicitly and talks to Turso directly.
 *
 * Additive and idempotent:
 *   - ADD COLUMN is skipped if `slug` already exists.
 *   - The unique index is created IF NOT EXISTS. SQLite treats NULLs as
 *     distinct, so the index is safe to create before any row has a slug.
 *   - The backfill only ever touches rows where slug IS NULL, so re-running
 *     it never rewrites a slug that has already been shared.
 * No existing column is altered and no row is deleted.
 *
 * Usage: npx tsx scripts/migrate-slugs-turso.ts [--dry-run]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { buildSlug } from '../lib/slug'

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

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = loadEnvLocal()
  if (!env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL missing from .env.local')

  const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })

  const info = await db.execute('PRAGMA table_info(Opportunity)')
  const hasSlug = info.rows.some(r => r.name === 'slug')
  console.log(`[migrate] slug column present: ${hasSlug}`)

  if (!hasSlug) {
    if (dryRun) {
      console.log('[migrate] DRY RUN — would ALTER TABLE Opportunity ADD COLUMN slug TEXT')
    } else {
      await db.execute('ALTER TABLE Opportunity ADD COLUMN slug TEXT')
      console.log('[migrate] added column slug TEXT')
    }
  }

  if (!dryRun) {
    // Name matches what Prisma generates for `@unique`, so a later
    // `prisma db push` sees the index as already-applied rather than
    // trying to recreate it.
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Opportunity_slug_key ON Opportunity(slug)')
    console.log('[migrate] ensured unique index Opportunity_slug_key')
  }

  const targets = await db.execute(
    dryRun && !hasSlug
      ? 'SELECT id, title, org FROM Opportunity LIMIT 5'
      : 'SELECT id, title, org FROM Opportunity WHERE slug IS NULL'
  )
  console.log(`[migrate] ${targets.rows.length} row(s) need a slug`)

  if (dryRun) {
    for (const row of targets.rows.slice(0, 5)) {
      const slug = buildSlug(
        { title: String(row.title), org: row.org == null ? null : String(row.org) },
        String(row.id).slice(-6)
      )
      console.log(`  ${row.id} -> ${slug}`)
    }
    console.log('[migrate] DRY RUN — nothing written')
    return
  }

  let written = 0
  let fellBack = 0

  for (const row of targets.rows) {
    const id = String(row.id)
    // Seeded from the row's own id rather than randomly: recomputing a slug
    // for an existing row must always produce the same string.
    const slug = buildSlug(
      { title: String(row.title), org: row.org == null ? null : String(row.org) },
      id.slice(-6)
    )
    try {
      await db.execute({ sql: 'UPDATE Opportunity SET slug = ? WHERE id = ?', args: [slug, id] })
      written++
    } catch {
      // Unique-index rejection: same title, same org, same last-6 of the id.
      // The bare id is always unique, so the row stays addressable.
      await db.execute({ sql: 'UPDATE Opportunity SET slug = ? WHERE id = ?', args: [id, id] })
      fellBack++
    }
    if ((written + fellBack) % 250 === 0) console.log(`  …${written + fellBack}/${targets.rows.length}`)
  }

  console.log(`[migrate] done — wrote ${written}, fell back to id for ${fellBack}`)

  const check = await db.execute('SELECT COUNT(*) AS n FROM Opportunity WHERE slug IS NULL')
  console.log(`[migrate] rows still without a slug: ${check.rows[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
