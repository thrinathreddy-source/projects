import { lookup } from 'dns/promises'
import { isIP } from 'net'

export interface OgMedia {
  imageUrl: string | null
  videoUrl: string | null
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '[::1]'])

/** IPv4/IPv6 loopback, private, and link-local ranges — includes the
 * 169.254.169.254-style cloud metadata range.
 *
 * Every branch below is a range that must never be reachable from a URL a
 * third party chose. Two classes of bypass this used to allow, both of
 * which reach the same internal targets the IPv4 rules already block:
 *
 *  • IPv4-mapped/compatible IPv6 — `::ffff:127.0.0.1` and `::ffff:7f00:1`
 *    are loopback, but neither matched a `^127\.` test nor any of the v6
 *    prefixes, so they were treated as a public address and fetched. The
 *    mapped form is unwrapped and re-checked as IPv4 rather than pattern-
 *    matched, so it can't drift out of sync with the rules above it.
 *  • Ranges that simply weren't listed: 0.0.0.0/8 (on Linux, 0.x reaches
 *    the local host), 100.64/10 carrier-grade NAT, 192.0.0.0/24 protocol
 *    assignments, and the IPv6 unspecified address.
 */
export function isPrivateAddress(ip: string): boolean {
  const v6 = ip.toLowerCase()

  // Unwrap IPv4-in-IPv6 first — "::ffff:10.0.0.1" and "::ffff:a00:1" are
  // the same host as 10.0.0.1 and must answer to the IPv4 rules.
  const mapped = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateAddress(mapped[1])
  const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return isPrivateAddress(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
  }

  if (/^0\./.test(ip)) return true                          // 0.0.0.0/8 — "this host"
  if (/^127\./.test(ip)) return true                        // loopback
  if (/^10\./.test(ip)) return true                         // private
  if (/^192\.168\./.test(ip)) return true                   // private
  if (/^192\.0\.0\./.test(ip)) return true                  // IETF protocol assignments
  if (/^169\.254\./.test(ip)) return true                   // link-local + cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true    // private
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true // CGNAT 100.64/10

  if (v6 === '::1') return true                             // loopback
  if (v6 === '::') return true                              // unspecified
  if (v6.startsWith('fe80:')) return true                   // link-local
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true // unique local
  return false
}

/**
 * Refuses to fetch a hostname that resolves to a loopback/private/
 * link-local address — the SSRF guard. An opportunity's URL is
 * user-controlled in two of this module's three callers (a paid
 * submission's own application link, an admin manual create), so this
 * runs before every fetch and before following every redirect hop, not
 * just once up front.
 */
async function isSafeHost(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(h)) return false
  if (isIP(h)) return !isPrivateAddress(h)
  try {
    const results = await lookup(h, { all: true })
    return results.length > 0 && results.every(r => !isPrivateAddress(r.address))
  } catch {
    return false // can't resolve — don't fetch what we can't vet
  }
}

/**
 * Fetches a URL's <head> HTML, refusing loopback/private targets at the
 * start and at every redirect hop (fetch() follows redirects by default,
 * which would otherwise let a public-looking URL 30x its way to an
 * internal address). Bounded to 4 hops, a 5s timeout per hop, and a 60KB /
 * </head> read cap — the same limits as before, just redirect-aware now.
 */
async function fetchHtmlHead(startUrl: string): Promise<string | null> {
  let currentUrl = startUrl

  for (let hop = 0; hop < 4; hop++) {
    let parsed: URL
    try {
      parsed = new URL(currentUrl)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:') return null
    if (!(await isSafeHost(parsed.hostname))) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let res: Response
    try {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OppIDXBot/1.0; +https://oppidx.com)' },
      })
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return null
      try {
        currentUrl = new URL(location, currentUrl).toString()
      } catch {
        return null
      }
      continue
    }

    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null

    const reader = res.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let html = ''
    try {
      while (html.length < 60_000) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
        if (/<\/head>/i.test(html)) break
      }
    } finally {
      reader.cancel().catch(() => {})
    }
    return html
  }

  return null // too many redirects
}

/**
 * A URL pulled out of a third party's og:image/og:video tag, not one we
 * chose — https-only is necessary but not sufficient. Now that SafeImage
 * renders these through next/image (see components/ui/SafeImage.tsx), our
 * own server fetches this URL to optimize it, which is exactly the
 * SSRF shape isSafeHost() already exists to stop; a scraped page could
 * otherwise point og:image at an internal service and get our backend to
 * request it. Same check as the page fetch itself, just applied to what
 * that page claims its media URL is.
 */
export async function isSafeMediaUrl(raw: string): Promise<boolean> {
  if (!/^https:\/\//.test(raw)) return false
  try {
    return await isSafeHost(new URL(raw).hostname)
  } catch {
    return false
  }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp',
])

/**
 * Fetches an externally hosted raster image for the same-origin image proxy.
 * Redirects are handled manually so every destination receives the same DNS
 * private-address check as the original URL. Keeping this in the ingestion
 * module means the crawler and serving path share one SSRF policy.
 */
export async function fetchSafeExternalImage(startUrl: string): Promise<Response | null> {
  let currentUrl = startUrl

  for (let hop = 0; hop < 3; hop++) {
    if (!(await isSafeMediaUrl(currentUrl))) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OppIDXBot/1.0; +https://oppidx.com)' },
      })
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) return null
      try {
        currentUrl = new URL(location, currentUrl).toString()
      } catch {
        return null
      }
      continue
    }

    const contentType = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase()
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (!response.ok || !contentType || !ALLOWED_IMAGE_TYPES.has(contentType) || contentLength > MAX_IMAGE_BYTES) return null
    return response
  }

  return null
}

/**
 * Best-effort og:image + og:video fetch for a listing's own application
 * page — real, sourced media at ingestion time, never a stock photo or a
 * fabricated visual. Fails silently: a listing with no fetchable media
 * just renders text-only, same as every card does today — never broken
 * media, never a placeholder pretending to be real.
 *
 * Video is deliberately conservative: only an explicit og:video/og:video:url
 * tag counts. A site that tags one is making a real claim about it; a
 * YouTube iframe spotted somewhere in the page body could be an ad, a
 * footer video, anything — not worth the false-positive risk or the extra
 * bytes it'd take to scan past </head> looking for one.
 */
export async function fetchOgMedia(url: string): Promise<OgMedia> {
  const empty: OgMedia = { imageUrl: null, videoUrl: null }
  const html = await fetchHtmlHead(url)
  if (!html) return empty

  const imageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  const rawImage = imageMatch?.[1]?.trim()
  const imageUrl = rawImage && (await isSafeMediaUrl(rawImage)) ? rawImage : null

  const videoMatch =
    html.match(/<meta[^>]+property=["']og:video(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url|:secure_url)?["']/i)
  const rawVideo = videoMatch?.[1]?.trim()
  const videoUrl = rawVideo && (await isSafeMediaUrl(rawVideo)) ? rawVideo : null

  return { imageUrl, videoUrl }
}
