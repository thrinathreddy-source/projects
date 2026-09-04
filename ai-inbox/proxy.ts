import { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret } from './lib/sessionSecret'
import { secureCompare }    from './lib/secureCompare'

const COOKIE  = 'oppidx_session'
const MAX_AGE = 60 * 60 * 24 * 30 * 1000  // 30 days

/* ── Bot/scanner path block — from Mayatara, applies site-wide ──
   Blocks obviously malicious probe paths before anything else runs.
   Note: bare "admin" is deliberately NOT in this list — oppidx has a real
   /admin route (session-gated below); only WordPress/PHP-scanner-style
   admin paths are blocked. */
const BLOCKED_PATH_PATTERNS = [
  // NOT .xml — that's a legitimate extension the site itself serves
  // (sitemap.xml, feed.xml), and this pattern was silently 404ing both.
  /\.(php|asp|aspx|jsp|cgi|env|git|sql|bak|config|yaml|yml|ini|log|sh|bash)$/i,
  /\/(wp-admin|wp-login|phpmyadmin|manager|console|shell|cmd|eval)/i,
  /\/(\.env|\.git|\.htaccess|\.well-known\/acme-challenge)/i,
  /\/(etc\/passwd|proc\/self|windows\/win\.ini)/i,
]

/* ── In-edge rate limiter (oppidx's own auth endpoints only) ─────────────────
   Keyed by IP + route.  Max 10 attempts per 15 min window; locks 30 min.
   Uses globalThis so the Map survives hot-reloads in dev.
   In production with multiple instances, replace with Redis / KV.        */
declare global { var __rl: Map<string, { hits: number; since: number; lockUntil: number }> | undefined }
globalThis.__rl ??= new Map()
const rl = globalThis.__rl

function edgeRateLimit(key: string): { ok: boolean; retryAfter?: number } {
  const now    = Date.now()
  const WINDOW = 15 * 60_000   // 15 min
  const MAX    = 10
  const LOCK   = 30 * 60_000   // 30 min lock

  const e = rl.get(key)
  if (e && now < e.lockUntil) return { ok: false, retryAfter: Math.ceil((e.lockUntil - now) / 1000) }
  if (!e || now - e.since > WINDOW) { rl.set(key, { hits: 1, since: now, lockUntil: 0 }); return { ok: true } }
  e.hits++
  if (e.hits > MAX) { e.lockUntil = now + LOCK; return { ok: false, retryAfter: Math.ceil(LOCK / 1000) } }
  return { ok: true }
}

/* ── In-edge rate limiter (Events/Pulse/Match's own /api/* endpoints,
   formerly Mayatara's) ─────────────────────────────────────────────────────
   Separate Map/semantics from oppidx's limiter above — kept distinct rather
   than unified, since the two services' rate-limit shapes differ (this one
   is a simple fixed-window counter, not a lock-then-cooldown scheme) and
   conflating them risks behavior drift on either service. */
declare global { var __mtRl: Map<string, { count: number; resetAt: number }> | undefined }
globalThis.__mtRl ??= new Map()
const mtRl = globalThis.__mtRl

function matchServiceRateLimit(id: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = mtRl.get(id)
  if (!entry || now > entry.resetAt) {
    mtRl.set(id, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'anonymous'
  )
}

/* ── Session verification (Web Crypto — Edge safe) ──────────── */
async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length < 3) return false
  const sig     = parts.pop()!
  const payload = parts.join('.')

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sigBuf   = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const expected = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  // Constant-time, matching lib/session.ts — this is the check standing in
  // front of /admin, and `!==` leaks the signature a byte at a time.
  if (!secureCompare(sig, expected)) return false
  const ts = parseInt(parts[1] ?? '0')
  // NaN fails every comparison, so an unparseable timestamp would have
  // returned false here anyway — being explicit so it stays that way.
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < MAX_AGE
}

/* ── Security headers ───────────────────────────────────────── */
function applySecurityHeaders(res: NextResponse, req: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === 'production'

  // /embed/* pages exist specifically to be framed by third-party sites
  // (see app/embed/opportunity-of-the-day) — the clickjacking protections
  // below apply to the rest of the site, but blocking framing here would
  // make the embeddable widget feature literally unusable everywhere,
  // including its own live preview on /widget.
  const isEmbeddable = req.nextUrl.pathname.startsWith('/embed/')

  // Prevent MIME-type sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff')

  // Prevent clickjacking (except the pages meant to be embedded — see above)
  if (!isEmbeddable) {
    res.headers.set('X-Frame-Options', 'DENY')
  }

  // Stop browsers from sending Referer to external sites
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Disable sensitive browser features
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()',
  )

  // Force HTTPS in production
  if (isProd) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    )
  }

  // Content Security Policy
  // • script-src includes 'unsafe-eval' ONLY outside production. `next dev`
  //   needs it (HMR and the dev overlay eval their module payloads), but a
  //   production bundle does not, and shipping it live hands any injected
  //   string the ability to become executable code — which is most of what
  //   a CSP is there to prevent. Dev-only, so the local console stays clean
  //   without weakening the deployed policy.
  // • script-src includes 'unsafe-inline' because Next.js injects inline scripts
  // • style-src includes 'unsafe-inline' because Framer Motion uses inline styles
  // • script-src/connect-src/frame-src include Razorpay's domains because /submit
  //   loads their Checkout.js widget, which opens a payment iframe and talks to
  //   their API directly from the browser — without these the widget silently
  //   fails to load once live Razorpay keys are configured.
  // • script-src/connect-src include va.vercel-scripts.com for Vercel Analytics —
  //   in production on Vercel it loads via a same-origin proxied path ('self'
  //   covers it), but `next dev` falls back to this direct host, so it's needed
  //   for a clean local console too.
  // • connect-src also includes Supabase/Anthropic/OpenAI origins for the
  //   Events/Pulse/Match features (client-side Supabase calls, AI-assisted
  //   matching/interview under /events, /pulse, /match and their APIs).
  // • Tighten further once you move to a CDN / nonces
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://checkout.razorpay.com https://va.vercel-scripts.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.openai.com",
    // 'self' is required so /widget can preview the embeddable badge — with
    // only the Razorpay origins listed, frame-src is a full override of
    // default-src (no implicit 'self' fallback once it's specified), which
    // silently blocked the site from framing even its own pages. The apex
    // host is listed explicitly too: 'self' resolves to the exact enforcing
    // origin (www.oppidx.com), but SITE_URL (used to build the embed's src)
    // is the bare apex, which 301s to www — a different origin as far as
    // CSP's frame-src matching is concerned, checked before the redirect.
    "frame-src 'self' https://oppidx.com https://api.razorpay.com https://checkout.razorpay.com",
    isEmbeddable ? "frame-ancestors *" : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)

  // Remove fingerprinting headers
  res.headers.delete('X-Powered-By')
  res.headers.delete('Server')

  return res
}

/* ── Proxy (formerly "Middleware" — renamed in Next.js 16) ───── */
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/register']
// Events/Pulse/Match's own API prefixes — formerly all under one
// /api/mayatara/* prefix when they were a separately-branded product; now
// split across their own top-level API namespaces post-merge.
const MATCH_SERVICE_PREFIXES = ['/api/events/', '/api/pulse/live/', '/api/match/']
const MATCH_SERVICE_CRON_ROUTES = ['/api/match/find', '/api/pulse/live/refresh']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  /* ── Bot/scanner path block — before anything else ── */
  if (BLOCKED_PATH_PATTERNS.some(r => r.test(pathname))) {
    return new NextResponse(null, { status: 404 })
  }

  /* ── Rate-limit oppidx's own auth POST endpoints ── */
  if (AUTH_ROUTES.some(r => pathname.startsWith(r)) && req.method === 'POST') {
    // getIP() rather than reading x-forwarded-for[0] directly — see lib/ip.ts:
    // the left-most forwarded entry is client-supplied, so keying the login
    // limiter off it let an attacker rotate a fake IP per request and never
    // hit the 10-attempt lock.
    const ip = getIP(req)
    const rlResult = edgeRateLimit(`${ip}:${pathname}`)
    if (!rlResult.ok) {
      return new NextResponse(
        JSON.stringify({ error: `Too many attempts. Try again in ${rlResult.retryAfter}s.` }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After':  String(rlResult.retryAfter),
            'X-Content-Type-Options': 'nosniff',
          },
        },
      )
    }
  }

  /* ── Rate-limit Events/Pulse/Match's own API endpoints (formerly all
     under one /api/mayatara/* prefix) ──
     Auth routes: strict (10/15min). Everything else under these prefixes:
     general limit (60/60s). Scoped so oppidx's own /api/* is unaffected. */
  if (MATCH_SERVICE_PREFIXES.some(p => pathname.startsWith(p))) {
    const ip = getIP(req)

    if (pathname.startsWith('/api/match/auth/') && req.method === 'POST') {
      if (!matchServiceRateLimit(`mt-auth:${ip}`, 10, 15 * 60_000)) {
        return new NextResponse(
          JSON.stringify({ error: 'Too many attempts. Try again in 15 minutes.' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '900' } },
        )
      }
    }

    if (!matchServiceRateLimit(`mt-api:${ip}`, 60, 60_000)) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
      )
    }

    /* Cron endpoints: server-to-server only, shared-secret gated — same
       Authorization: Bearer CRON_SECRET convention Vercel Cron sends
       natively (see vercel.json), which the route handlers themselves
       also check; this is just an earlier rejection at the edge. */
    if (MATCH_SERVICE_CRON_ROUTES.includes(pathname)) {
      const auth = req.headers.get('authorization')
      const expected = process.env.CRON_SECRET
      if (!expected || auth !== `Bearer ${expected}`) {
        return new NextResponse(null, { status: 401 })
      }
    }

    /* Block requests with no User-Agent (raw bots/scanners) */
    if (!req.headers.get('user-agent')) {
      return new NextResponse(null, { status: 400 })
    }
  }

  /* ── Protected paths — session required ──
     OppIDX is a public opportunities board: everything is open by default,
     including nonexistent/mistyped URLs (which should fall through to
     Next.js's normal 404, not get redirected to /auth). Only /admin itself
     needs a session — this used to be an ever-growing allowlist of "public"
     prefixes that defaulted to *protected* for anything not listed, which
     silently 302'd every unknown path (typos, bad links, new routes we
     forgot to add here) to the admin login screen instead of 404ing.
     The shared Supabase login (the tab on /account) is entirely client-side and
     isn't gated here — it never matched this check anyway. ── */
  const isProtected = pathname === '/admin' || pathname.startsWith('/admin/')

  const session = req.cookies.get(COOKIE)?.value

  if (isProtected) {
    const authed = await isValidSession(session)
    if (!authed) {
      const url = req.nextUrl.clone()
      url.pathname = '/auth'
      url.searchParams.set('from', pathname)
      const redirect = NextResponse.redirect(url)
      return applySecurityHeaders(redirect, req)
    }
  }

  const res = NextResponse.next()
  return applySecurityHeaders(res, req)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
