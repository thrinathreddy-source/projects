/**
 * True if `e` is Turso refusing a query because the account has exhausted
 * its plan's row quota — "SQL read operations are forbidden... do you need
 * to upgrade your plan?" Reproduced directly against production: every
 * Prisma call failed with this the moment the free tier's monthly
 * rows-read quota hit 100%, confirmed on the Turso dashboard itself
 * ("Your account is temporarily blocked because you exceeded your usage
 * quota").
 *
 * This is not a bug in this app, and no code here can fix it — it clears on
 * its own (a plan upgrade, or the next monthly reset) without anyone
 * touching anything. See lib/cronGuard.ts for what that distinction is for.
 *
 * Checked structurally, not via `instanceof PrismaClientKnownRequestError`,
 * for the same reason lib/isUniqueConstraintError.ts does: @prisma/adapter-
 * libsql (what actually talks to Turso here — see lib/db.ts) doesn't always
 * normalize every error into that class the way Prisma's own SQLite driver
 * does. Checking `.code` on whatever came back, with a message-text
 * fallback, is what actually held up against the real, reproduced error
 * rather than an assumption about its shape.
 */
export function isTursoQuotaBlocked(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code === 'BLOCKED') return true
  const message = (e as { message?: string } | null)?.message ?? ''
  return message.includes('SQL read operations are forbidden')
    || message.includes('SQL write operations are forbidden')
    || (message.includes('Operation was blocked') && message.includes('upgrade your plan'))
}
