import { NextResponse, type NextRequest } from "next/server";

// ── Per-IP sliding-window rate limiter (Edge-compatible, in-memory) ──────────
// This one is deliberately coarse. It runs on every request at the edge, where
// a database round trip would cost more than it's worth, and its memory is
// per-instance. So it exists only to absorb obvious floods; the accurate,
// shared-counter limits that decide real policy live in the route handlers
// (see rateLimitShared in lib/security.ts). Keep the numbers here well above
// what a genuine burst looks like, or this silently overrides those limits.
const windows = new Map<string, { count: number; resetAt: number }>();
let callsSinceSweep = 0;

function edgeRateLimit(id: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  // Every key (auth:$ip, login:$ip, api:$ip for every distinct IP seen) is
  // added and never removed once its window expires — on a long-lived edge
  // instance under real traffic that's an unbounded, slow leak. A cheap
  // periodic sweep instead of pruning on every call, since this runs on
  // every request.
  if (++callsSinceSweep >= 500) {
    callsSinceSweep = 0;
    for (const [key, entry] of windows) {
      if (now > entry.resetAt) windows.delete(key);
    }
  }

  const entry = windows.get(id);
  if (!entry || now > entry.resetAt) {
    windows.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "anonymous"
  );
}

// Constant-time string compare (no Buffer — must run in the Edge runtime).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Origins allowed to call the API. Built from the deployment's own identity so
// this keeps working no matter what the Vercel project ends up being named.
function allowedOrigins(): string[] {
  const list: string[] = [];
  const add = (u?: string) => { if (u) list.push(u.replace(/\/$/, "")); };

  add(process.env.NEXT_PUBLIC_APP_URL);
  // Set automatically by Vercel: the stable production domain, and this
  // specific deployment's URL (which is what preview deployments send).
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  // Same hardcoded fallback lib/seo.ts uses for SITE. Without it, an
  // environment where none of the above resolve to the live custom domain
  // (non-Vercel hosting, a misconfigured project) makes every legitimate
  // same-origin browser POST — register, feedback, report, grievance, all of
  // which send an Origin header — get rejected with 403, while SEO output
  // silently keeps pointing at the right domain and masks the misconfig.
  add("https://www.themayatara.com");

  return list;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getIP(req);
  const method = req.method;

  // Our own generated metadata files. These must be checked before the
  // blocklist below, which rejects anything ending in .xml — sitemap.xml
  // included, which silently 404'd it for crawlers.
  const isPublicMetadata = pathname === "/sitemap.xml" || pathname === "/robots.txt";

  // ── Block obviously malicious paths ────────────────────────────────────────
  // /.well-known/acme-challenge is NOT in this list: it's a reserved path
  // (RFC 8615) used for HTTP-01 domain validation. Vercel's own cert flow
  // doesn't route through here, but anything that ever needs to serve a
  // validation token through the app (a CDN/WAF in front, a partner
  // integration) would have TLS renewal silently break against a 404 here.
  const blocked = [
    /\.(php|asp|aspx|jsp|cgi|env|git|sql|bak|config|xml|yaml|yml|ini|log|sh|bash)$/i,
    /\/(wp-admin|wp-login|phpmyadmin|admin|manager|console|shell|cmd|eval)/i,
    /\/(\.env|\.git|\.htaccess)/i,
    /\/(etc\/passwd|proc\/self|windows\/win\.ini)/i,
  ];
  if (!isPublicMetadata && blocked.some(r => r.test(pathname))) {
    return new NextResponse(null, { status: 404 });
  }

  // ── Rate limits (per IP) ───────────────────────────────────────────────────
  // Auth endpoints. 10 per 15 minutes was the binding constraint on signups —
  // it sits in front of /api/auth/register, so a shared campus or office
  // address hit it long before the route's own limit mattered. Raised to a
  // flood ceiling; the real per-IP signup policy is enforced in the route.
  if (pathname.startsWith("/api/auth/") && method === "POST") {
    if (!edgeRateLimit(`auth:${ip}`, 60, 15 * 60_000)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many attempts. Try again in 15 minutes." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "900" } }
      );
    }
  }

  // NOTE: this never actually fires. app/login/page.tsx calls
  // supabase.auth.signInWithPassword() directly from the browser against
  // Supabase's own auth API — it never POSTs to this app's /login, and no
  // app/api/auth/login route exists either. Credential-stuffing protection on
  // sign-in is therefore whatever Supabase's own project-level rate limits
  // provide, not this. Left in place (harmless) in case a server-side login
  // route is ever added, but don't treat login as rate-limited here.
  if (pathname === "/login" && method === "POST") {
    if (!edgeRateLimit(`login:${ip}`, 8, 10 * 60_000)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many login attempts. Try again in 10 minutes." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "600" } }
      );
    }
  }

  // All API routes: general limit. Also raised for shared NAT — the signup
  // funnel alone (register, interview, profile save) is several calls per
  // person, so 60/min was roughly a dozen simultaneous users on one address.
  if (pathname.startsWith("/api/")) {
    if (!edgeRateLimit(`api:${ip}`, 300, 60_000)) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }
  }

  // ── Cron endpoint: server-to-server only ───────────────────────────────────
  // Vercel Cron cannot send custom headers — it sends `Authorization: Bearer
  // $CRON_SECRET`. The x-cron-secret form is kept so the job can still be
  // triggered by hand with curl.
  if (pathname === "/api/match/find") {
    const expected = process.env.CRON_SECRET || "";
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const custom = req.headers.get("x-cron-secret") || "";
    const ok = expected.length > 0 && (safeEqual(bearer, expected) || safeEqual(custom, expected));
    if (!ok) {
      return new NextResponse(null, { status: 401 });
    }
  }

  // ── Block requests with no User-Agent (raw bots/scanners) ─────────────────
  if (pathname.startsWith("/api/") && !req.headers.get("user-agent")) {
    return new NextResponse(null, { status: 400 });
  }

  // ── CORS: API only accepts requests from our own deployments ───────────────
  const origin = req.headers.get("origin");
  if (pathname.startsWith("/api/") && origin) {
    const isOwnOrigin = allowedOrigins().includes(origin.replace(/\/$/, ""));
    const isLocalhost = process.env.NODE_ENV !== "production" &&
      /^http:\/\/localhost(:\d+)?$/.test(origin);
    if (!isOwnOrigin && !isLocalhost) {
      return new NextResponse(null, { status: 403 });
    }
  }

  // ── Apply security headers to every response ───────────────────────────────
  const res = NextResponse.next();

  // Strict Transport Security — force HTTPS for 2 years
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // Prevent clickjacking
  res.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer policy — don't leak URL to third parties
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable everything not needed
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );

  // XSS protection (legacy browsers)
  res.headers.set("X-XSS-Protection", "1; mode=block");

  // Content Security Policy
  //
  // @vercel/analytics and @vercel/speed-insights both load their script from
  // va.vercel-scripts.com in development and from same-origin
  // /_vercel/{insights,speed-insights}/script.js everywhere else (see
  // getScriptSrc in each package). So the exception they need is a
  // development-only one, and production keeps the strict script-src.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js needs these
    isDev ? "https://va.vercel-scripts.com" : "",
  ].join(" ").trim();

  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      // Fonts are self-hosted by next/font now — nothing loads from Google.
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.openai.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; ")
  );

  // Remove fingerprinting headers
  res.headers.delete("X-Powered-By");
  res.headers.delete("Server");

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
