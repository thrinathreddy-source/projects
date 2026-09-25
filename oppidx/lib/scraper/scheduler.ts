import { runScrapePass } from './run'
import { afterScrapePass } from './afterPass'

const HOUR_MS = 60 * 60 * 1000

// Guarded on globalThis so Next.js dev-mode module reloads can't stack up duplicate intervals.
const g = globalThis as unknown as { __oppidxScraperStarted?: boolean }

/** Starts the native, in-process hourly scraper. Runs entirely inside this Node
 * process — no external cron, webhook, or Claude session required to keep it going. */
export function startScraperScheduler() {
  if (g.__oppidxScraperStarted) return
  g.__oppidxScraperStarted = true

  // Awaits the follow-up work rather than dropping the result — this path
  // previously scraped and then did nothing with what it found, so a
  // persistent-server deployment never notified anyone and never pinged
  // Google. See lib/scraper/afterPass.ts.
  const tick = () => {
    runScrapePass()
      .then(result => afterScrapePass(result, 'scraper'))
      .catch(err => console.error('[scraper] pass threw:', err))
  }

  tick() // first pass right away on server boot
  setInterval(tick, HOUR_MS)

  console.log('[scraper] native hourly scheduler started')
}
