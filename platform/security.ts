/**
 * Shared security utilities for all API routes.
 * - Rate limiting (in-memory, per-IP, sliding window)
 * - Input sanitisation
 * - Request size enforcement
 * - Timing-safe string comparison
 */
import { timingSafeEqual } from "crypto";

// ── Rate limiter ─────────────────────────────────────────────────────────────
interface RateEntry { count: number; resetAt: number }
const stores: Record<string, Map<string, RateEntry>> = {};

// Entries are keyed by IP and were never removed — an address that hit an
// endpoint once and never returned kept its entry for the life of the process,
// so every bucket grew monotonically with unique visitors. lib/rateLimit.ts
// already swept for exactly this reason; this one didn't. Expired entries
// carry no state worth keeping: rateLimit() below treats a past resetAt as a
// fresh window anyway, so dropping them is equivalent to leaving them.
if (typeof setInterval !== "undefined") {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const store of Object.values(stores)) {
      for (const [id, entry] of store) if (now > entry.resetAt) store.delete(id);
    }
  }, 15 * 60_000);
  // Don't hold a serverless invocation open purely for the sweep.
  sweep.unref?.();
}

export function rateLimit(
  key: string,           // bucket name e.g. "login", "register"
  id: string,            // usually IP address
  max: number,           // max requests
  windowMs: number       // window in ms
): { ok: boolean; remaining: number; retryAfter: number } {
  if (!stores[key]) stores[key] = new Map();
  const store = stores[key];
  const now = Date.now();
  const entry = store.get(id);

  if (!entry || now > entry.resetAt) {
    store.set(id, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfter: 0 };
  }

  if (entry.count >= max) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { ok: true, remaining: max - entry.count, retryAfter: 0 };
}

// ── Get real IP from Vercel/proxy headers ────────────────────────────────────
export function getIP(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

// ── Rate limit response helper ───────────────────────────────────────────────
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please wait before trying again." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": "0",
      },
    }
  );
}

// ── Input sanitisation ───────────────────────────────────────────────────────
const DANGEROUS = /<script|javascript:|on\w+\s*=|<iframe|<object|<embed|data:/gi;

export function sanitise(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(DANGEROUS, "").trim().slice(0, 2000);
}

export function sanitiseRecord(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const cleanKey = k.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64);
    if (cleanKey) out[cleanKey] = sanitise(v);
  }
  return out;
}

// ── Request body size guard (call before json()) ─────────────────────────────
export function checkSize(req: Request, maxBytes = 32_768): Response | null {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) {
    return new Response(JSON.stringify({ error: "Request too large." }), {
      status: 413, headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

// ── Timing-safe secret comparison (prevents timing attacks on CRON_SECRET) ───
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

// ── Email format check ───────────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 320;
}

// ── Password strength ────────────────────────────────────────────────────────
export function isStrongPassword(p: string): { ok: boolean; reason?: string } {
  if (p.length < 8)  return { ok: false, reason: "Password must be at least 8 characters." };
  if (p.length > 128) return { ok: false, reason: "Password too long." };
  return { ok: true };
}
