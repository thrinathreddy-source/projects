/**
 * Shared security utilities for all API routes.
 * - Rate limiting (per-IP, sliding window — in-memory and DB-backed)
 * - Input sanitisation
 * - Request size enforcement
 * - Timing-safe string comparison
 */
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";

// ── Rate limiter ─────────────────────────────────────────────────────────────
interface RateEntry { count: number; resetAt: number }
const stores: Record<string, Map<string, RateEntry>> = {};

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

// ── Shared rate limiter (DB-backed) ──────────────────────────────────────────
// rateLimit() above keeps its counter in lambda memory, so each instance
// enforces the limit independently and a cold start resets it to zero. That is
// fine as a cheap burst guard but useless as actual policy under load. This
// version keeps one counter in Postgres, shared across every instance.
//
// Fails OPEN, down to the in-memory limiter: if the database is unreachable we
// would rather let a signup through than hard-fail registration for everyone.
export async function rateLimitShared(
  key: string,
  id: string,
  max: number,
  windowMs: number
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  if (!supabaseAdmin) return rateLimit(key, id, max, windowMs);

  try {
    const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
      p_bucket: key,
      p_identity: id,
      p_max: max,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw error;

    // The function returns a single row as a one-element array.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") throw new Error("bad rpc shape");

    return { ok: row.allowed, remaining: row.remaining ?? 0, retryAfter: row.retry_after ?? 0 };
  } catch (e) {
    console.error("[rateLimitShared] falling back to in-memory:", e instanceof Error ? e.message : e);
    return rateLimit(key, id, max, windowMs);
  }
}

// ── Hash an identifier before storing it ─────────────────────────────────────
// For anything we keep on disk (grievance rows, abuse trails) we want to be
// able to spot repeats from the same source without holding raw IP addresses.
export function hashIdentifier(value: string): string {
  const salt = process.env.ENCRYPTION_KEY || "";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
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

// ── Size-capped JSON body reader ─────────────────────────────────────────────
// Content-Length is client-supplied and cannot be trusted to reflect the
// actual body (e.g. chunked transfer-encoding omits it, or a client can lie).
// Reading the body as text and measuring its real byte length is the only way
// to enforce the cap; JSON.parse then runs on that already-bounded text.
export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes = 32_768
): Promise<{ ok: true; data: T } | { ok: false; error: Response }> {
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return {
      ok: false,
      error: new Response(JSON.stringify({ error: "Request too large." }), {
        status: 413, headers: { "Content-Type": "application/json" },
      }),
    };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      error: new Response(JSON.stringify({ error: "Invalid JSON." }), {
        status: 400, headers: { "Content-Type": "application/json" },
      }),
    };
  }
}

// ── Timing-safe secret comparison (prevents timing attacks on CRON_SECRET) ───
export function safeCompare(a: string, b: string): boolean {
  // Compare the buffers, not the strings. A JS string's .length counts UTF-16
  // code units, so "é" and "a" both report length 1 while encoding to 2 bytes
  // and 1 — the old guard let that pair through and timingSafeEqual threw
  // RangeError on the mismatched byte lengths.
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ── Email format check ───────────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 320;
}

// ── Password strength ────────────────────────────────────────────────────────
// Length is the property that actually resists offline cracking, so the bar is
// length plus a block on the handful of passwords that appear in every breach
// corpus — not composition rules, which push people toward "Password1!".
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "letmein123", "iloveyou", "admin123", "welcome123",
  "abc123456", "football", "monkey123", "1q2w3e4r", "asdfghjkl", "trustno1",
  "sunshine", "princess", "dragon123", "passw0rd", "baseball", "starwars",
]);

export function isStrongPassword(p: string): { ok: boolean; reason?: string } {
  if (p.length < 10)  return { ok: false, reason: "Password must be at least 10 characters." };
  if (p.length > 128) return { ok: false, reason: "Password too long." };

  const lower = p.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { ok: false, reason: "That password appears in known breach lists. Pick another." };
  }
  if (/^(.)\1+$/.test(p)) {
    return { ok: false, reason: "Pick something less repetitive." };
  }
  return { ok: true };
}
