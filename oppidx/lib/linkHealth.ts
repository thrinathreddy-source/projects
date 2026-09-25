/**
 * Is a listing's application link still alive?
 *
 * Written to be *reluctant to condemn*. Retiring a listing removes it from the
 * board, the sitemap and Google's index, so a false positive costs a real
 * opportunity somebody could have applied to. A false negative only costs one
 * more check next time round. The asymmetry decides every judgement below.
 */

/** Only these mean "this posting is genuinely gone." Everything else is noise. */
const TERMINAL_STATUSES = new Set([404, 410])

export type LinkVerdict = 'alive' | 'dead' | 'inconclusive'

/**
 * A real browser User-Agent, because a scraper UA is itself a common reason
 * for a 403 — checking with one would manufacture the very failures this is
 * trying to measure. This makes a plain availability request, nothing more:
 * it does not bypass a login, solve a challenge, or read the page.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const TIMEOUT_MS = 12_000

/** Cap on how much of a page body is read. Enough to reach a deadline stated
 * in the posting; small enough that a huge page can't blow memory across a
 * concurrent batch. */
const MAX_BODY_BYTES = 400_000

async function request(url: string, method: 'HEAD' | 'GET', wantBody = false): Promise<{ status: number | null; body: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    })

    let body: string | null = null
    if (wantBody && method === 'GET' && res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
      const raw = await res.text()
      body = raw.length > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw
    }
    return { status: res.status, body }
  } catch {
    // Network error, DNS failure, timeout, aborted — all genuinely unknown,
    // never "dead". A DNS blip must not delete a company's whole listing set.
    return { status: null, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * HEAD first (cheap), then GET on anything non-terminal — plenty of hosts
 * reject HEAD outright with 403/405 while serving the same URL fine to a
 * normal GET, and treating that as death would retire live listings in bulk.
 */
/**
 * `wantBody` makes this go straight to GET and hand back the page text, so the
 * caller can read a deadline off the employer's own posting. Used only for
 * listings that don't have one yet — an availability check needs no body, and
 * requesting one for the whole board every cycle would be pure waste.
 */
export async function checkLink(url: string, wantBody = false): Promise<{ verdict: LinkVerdict; status: number | null; body: string | null }> {
  if (!wantBody) {
    const head = await request(url, 'HEAD')
    if (head.status !== null && head.status >= 200 && head.status < 300) {
      return { verdict: 'alive', status: head.status, body: null }
    }
  }

  const { status, body } = await request(url, 'GET', wantBody)

  if (status === null) return { verdict: 'inconclusive', status: null, body: null }
  if (status >= 200 && status < 300) return { verdict: 'alive', status, body }
  if (TERMINAL_STATUSES.has(status)) return { verdict: 'dead', status, body: null }

  // 401/403 (bot-blocked or login-walled), 429 (rate-limited), 5xx (their
  // problem, not the posting's), and anything else unexpected. Adzuna returns
  // 405 to a HEAD and 403 to non-browser clients for links that are perfectly
  // live — treating either as death would have wiped a large share of the
  // board.
  return { verdict: 'inconclusive', status, body: null }
}

/**
 * Consecutive terminal responses before a listing is retired.
 *
 * Two, not one: ATS hosts (Workday, Greenhouse) intermittently 404 during
 * their own deploys, and the checks are spaced a day apart, so two in a row is
 * a much stronger claim than one. Any inconclusive or alive result in between
 * resets the counter to zero.
 */
export const DEAD_STRIKES_TO_RETIRE = 2
