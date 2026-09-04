import { NextResponse } from 'next/server'
import { isTursoQuotaBlocked } from './tursoQuotaBlocked'

/**
 * Runs one cron route's real work, and turns a Turso quota block into a
 * quiet, honest skip instead of a false alarm.
 *
 * Every cron here is triggered by a GitHub Actions workflow running
 * `curl -sf`, so any non-2xx response fails that workflow run — which, per
 * whatever notification settings are on for the repo, can mean an email.
 * That is exactly the right signal for a real bug. It is the wrong signal
 * for "the database is temporarily out of quota": that condition isn't
 * something any code change here can fix, it clears on its own (a plan
 * upgrade, or the next monthly reset), and — before this existed — it
 * produced the identical failure email from this same cron every single
 * time it fired, for as long as the quota stayed exhausted, until someone
 * noticed and manually paused the workflow by hand.
 *
 * Only that one, specific, previously-reproduced condition is caught here.
 * Anything else — a real bug, a network blip, a third-party API failing —
 * still throws, still 500s, and still alerts exactly as it did before this
 * existed. A skipped run returns 200 with `skipped: true` and a reason, so
 * the truth is still visible to anyone who actually opens the run; it just
 * isn't pushed as something that needs a human to look at it.
 */
export async function runCronPass<T>(label: string, work: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await work()
    return NextResponse.json(result)
  } catch (error) {
    if (isTursoQuotaBlocked(error)) {
      console.warn(`[${label}] skipped — Turso's quota is currently exhausted; this resumes on its own once it clears, no action needed here.`)
      return NextResponse.json({ skipped: true, reason: 'turso-quota-blocked' })
    }
    throw error
  }
}
