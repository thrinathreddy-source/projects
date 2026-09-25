/**
 * Automated checks that gate whether a submitted resource becomes a live,
 * public Resource row — this is the "only verified resources get added"
 * enforcement, run synchronously at submit time (no human review queue).
 *
 * Two checks: the URL actually resolves to something live (not a dead
 * link), and it isn't a duplicate of a resource that's already listed.
 * Neither is a judgment call about quality — that's a known limitation of
 * "for now": these catch dead/duplicate links, not low-value ones.
 */

import { prisma } from '../db'

export interface CheckResult {
  ok: boolean
  reason?: string
}

// Best-effort SSRF guard: reject hosts that are obviously internal by name
// or literal IP before ever making the outbound request. This does not
// resolve DNS and re-check the resolved IP (a hostname could still rebind
// to an internal address after this check passes) — a real limitation, but
// a reasonable bar for a link-liveness check rather than a security
// boundary handling untrusted, high-value input.
const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', '::1'])

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(h)) return true
  if (h.endsWith('.local')) return true
  // Literal IPv4 in private/link-local/loopback ranges.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])]
    if (a === 127) return true // loopback
    if (a === 10) return true // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 169 && b === 254) return true // 169.254.0.0/16 — includes cloud metadata endpoints
  }
  return false
}

export function checkUrlWellFormed(url: string): CheckResult {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, reason: 'URL is not valid.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'URL must be http:// or https://.' }
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: 'That host is not allowed.' }
  }
  return { ok: true }
}

const FETCH_TIMEOUT_MS = 6000

/** Live reachability check — the link must actually resolve to something,
 * not a 4xx/5xx or a network failure. Tries HEAD first (cheap, no body);
 * some servers reject HEAD, so a GET retry follows before giving up. */
export async function checkUrlReachable(url: string): Promise<CheckResult> {
  const wellFormed = checkUrlWellFormed(url)
  if (!wellFormed.ok) return wellFormed

  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        // A generic bot UA gets flat-out 403'd by some legitimate, high-traffic
        // sites (seen live: Investopedia) that block anything not looking like
        // a browser — a real false-negative risk for a "is this link dead"
        // check, since we're only checking reachability, not scraping content.
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
      })
      res.body?.cancel().catch(() => {})
      if (res.ok || (res.status >= 300 && res.status < 400)) {
        return { ok: true }
      }
      if (method === 'GET') {
        return { ok: false, reason: `Link returned ${res.status} — looks dead.` }
      }
      // HEAD failed with a non-2xx that wasn't a network error — try GET before giving up.
    } catch {
      if (method === 'GET') {
        return { ok: false, reason: 'Could not reach that URL — check the link works and try again.' }
      }
      // HEAD threw (some hosts reject HEAD outright) — fall through to GET.
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, reason: 'Could not reach that URL — check the link works and try again.' }
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url.trim().toLowerCase()
  }
}

/** One-shot load of every live resource's normalized URL — for a scraper
 * pass checking many candidate URLs in a loop, this is one query instead of
 * one per candidate (see checkDuplicate, which stays single-query for the
 * one-off public submission path). */
export async function getExistingNormalizedUrls(): Promise<Set<string>> {
  const existing = await prisma.resource.findMany({ where: { deletedAt: null }, select: { url: true } })
  return new Set(existing.map(r => normalizeUrl(r.url)))
}

export async function checkDuplicate(url: string): Promise<CheckResult> {
  const target = normalizeUrl(url)
  const existing = await prisma.resource.findMany({
    where: { deletedAt: null },
    select: { url: true },
  })
  const isDup = existing.some(r => normalizeUrl(r.url) === target)
  return isDup ? { ok: false, reason: 'This resource is already listed.' } : { ok: true }
}
