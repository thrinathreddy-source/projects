/**
 * True if `e` is a unique-constraint violation from a create/insert whose
 * caller intends to treat that as "already exists, not an error" (e.g. a
 * duplicate signup, a same-day snapshot re-run). Checks both shapes seen
 * in this codebase: Prisma's own normalized P2002 (the plain SQLite
 * driver), and the raw SQLITE_CONSTRAINT code that comes through
 * un-normalized via @prisma/adapter-libsql against Turso — discovered
 * when a same-week retention-snapshot re-run threw instead of no-oping,
 * because the P2002-only check every other snapshot/upsert route in this
 * codebase used doesn't match what the libsql adapter actually throws.
 */
export function isUniqueConstraintError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code === 'P2002' || code === 'SQLITE_CONSTRAINT') return true
  const message = (e as { message?: string } | null)?.message ?? ''
  return message.includes('UNIQUE constraint failed')
}
