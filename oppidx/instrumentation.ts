// Runs once when this Next.js server instance boots (dev or prod, `next dev`/`next start`).
// This is what makes opportunity scraping native to the app on a persistent server: as long
// as the process is running, the hourly pass runs itself — no external cron needed.
//
// Skipped on Vercel (and any other serverless host): those freeze/recycle function instances
// between requests, so a setInterval here isn't guaranteed to fire again after the first
// invocation — see app/api/cron/scrape/route.ts, which an external scheduler
// (.github/workflows/scrape-cron.yml) hits hourly instead in that environment.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && !process.env.VERCEL) {
    const { startScraperScheduler } = await import('./lib/scraper/scheduler')
    startScraperScheduler()
  }
}

// Server-side error hook: Next.js calls this for uncaught errors in Server
// Components, Route Handlers, and Server Actions — the cases route.ts files
// that DON'T wrap themselves in try/catch would otherwise fail silently
// (visible only in server logs nobody's watching). Emails ADMIN_EMAIL via
// lib/alerts.ts, throttled per error site so a crash-looping route can't
// spam the inbox. Skipped outside production — every `next dev` type error
// would otherwise fire it while coding.
import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Node-runtime errors only — same guard `register()` above uses, and for
  // the same reason: everything this hook reaches is Node-only. lib/alerts
  // pulls in lib/email → lib/unsubscribeToken → node:crypto's createHmac,
  // none of which exist in the Edge runtime. Next bundles this file for both
  // runtimes, so without this the Edge copy carried a chain it could never
  // execute (the build warned about exactly that). The Edge runtime here is
  // just proxy.ts, which does its own HMAC via crypto.subtle and handles its
  // own failures.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return

  const message = err instanceof Error ? err.message : String(err)
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined

  const { sendThrottledOpsAlert } = await import('./lib/alerts')
  await sendThrottledOpsAlert(
    digest ?? `${request.method} ${request.path}`,
    `${request.method} ${request.path}`,
    `${request.method} ${request.path} (${context.routeType})\n${message}` +
    (digest ? `\nRef: ${digest}` : ''),
  )
}
