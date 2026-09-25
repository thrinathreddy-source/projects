/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the result.
 *
 * Pulled out of app/api/cron/link-health/route.ts (which had it as a local
 * helper) because lib/resources/scraper/run.ts needed the identical pattern
 * for the same reason: a serial `for` loop over a per-item network call, each
 * call bounded by its own timeout, inside a route with a hard wall-clock
 * ceiling (`maxDuration`). Serial awaiting sums every item's latency; bounded
 * concurrency caps the total at roughly (items / limit) call-lengths instead.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }))
  return results
}
