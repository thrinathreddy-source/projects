/**
 * Parses a JSON array that was written by this codebase and stored in a text
 * column, and returns [] instead of throwing if it isn't one.
 *
 * Several tables keep list data as a JSON string — PolicyDigest.items,
 * DailyDigest.opportunityIds — and every read site did a bare JSON.parse on
 * it. That is fine right up until one row is malformed (a truncated write, a
 * half-finished migration, a generator bug), at which point the throw takes
 * out whatever was reading it: the homepage, /api/pulse/recent, a digest page,
 * or the weekly digest cron, none of which have any business failing over one
 * bad snapshot.
 *
 * lib/opportunityPulseMap.ts already had exactly this guard, with the note
 * "malformed snapshot — skip rather than fail the whole pool". This is that
 * decision, made once and shared.
 *
 * The Array.isArray check matters as much as the try: `JSON.parse("null")` and
 * `JSON.parse("{}")` both succeed and then fail later on .length or iteration,
 * which is a harder failure to trace back here.
 */
export function parseJsonArray<T>(raw: string | null | undefined, context: string): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as T[]
    console.error(`[safeJson] ${context}: expected a JSON array, got ${typeof parsed}`)
    return []
  } catch {
    console.error(`[safeJson] ${context}: malformed JSON, treating as empty`)
    return []
  }
}
