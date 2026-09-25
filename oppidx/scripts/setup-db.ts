/**
 * Run once on a fresh environment to create the database and tables.
 *
 *   npx ts-node scripts/setup-db.ts
 *   — or —
 *   npm run setup-db
 *
 * For production (PostgreSQL), change DATABASE_URL in .env and run:
 *   npx prisma migrate deploy
 */

import { execSync } from 'child_process'
import { join } from 'path'

const ROOT = join(__dirname, '..')

// Push Prisma schema to database (creates tables, safe on existing DB)
console.log('Running prisma db push...')
execSync('npx prisma db push --skip-generate', { stdio: 'inherit', cwd: ROOT })

// Regenerate Prisma client
console.log('Generating Prisma client...')
execSync('npx prisma generate', { stdio: 'inherit', cwd: ROOT })

console.log('\n✅ Database ready.')
