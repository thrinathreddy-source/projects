import { z } from "zod";

/**
 * Server-side environment. Parsed once, at module load.
 *
 * The rule: the app must boot and be fully usable with only DATABASE_URL and
 * BETTER_AUTH_SECRET set. Every integration (fal, R2, Razorpay, PostHog) is
 * optional and has a documented degraded mode, so a fresh clone runs.
 */

const csv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be >= 16 chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),

  /**
   * CIDR ranges of proxies sitting in front of us, closest hop last.
   *
   * Auth rate limiting buckets by client IP, read from `x-forwarded-for`. That
   * header is a chain the client can prepend to, so Better Auth only trusts it
   * when it holds a single value *or* it can strip known proxies off the right
   * to find the first untrusted hop. Behind two layers — Cloudflare in front of
   * Vercel, say — an unset value here resolves no IP at all, and every visitor
   * then shares one bucket: three sign-ins per ten seconds for the whole site.
   */
  TRUSTED_PROXY_CIDRS: z.string().default(""),

  VIDEO_PROVIDERS: z.string().default("mock"),
  FAL_KEY: z.string().default(""),

  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default("arka"),
  R2_PUBLIC_BASE_URL: z.string().default(""),

  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  CRON_SECRET: z.string().default("dev-cron-secret"),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(30),

  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Arka <onboarding@resend.dev>"),
});

function loadServerEnv() {
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment. Copy .env.example to .env and fill these in:\n${issues}`,
    );
  }

  const raw = parsed.data;

  return {
    ...raw,
    isProduction: raw.NODE_ENV === "production",
    adminEmails: csv(raw.ADMIN_EMAILS).map((email) => email.toLowerCase()),
    trustedProxyCidrs: csv(raw.TRUSTED_PROXY_CIDRS),
    videoProviders: csv(raw.VIDEO_PROVIDERS),
    /** R2 is only usable when every credential is present. */
    hasR2:
      Boolean(raw.R2_ACCOUNT_ID) &&
      Boolean(raw.R2_ACCESS_KEY_ID) &&
      Boolean(raw.R2_SECRET_ACCESS_KEY),
    hasRazorpay: Boolean(raw.RAZORPAY_KEY_ID) && Boolean(raw.RAZORPAY_KEY_SECRET),
    hasGoogleOAuth: Boolean(raw.GOOGLE_CLIENT_ID) && Boolean(raw.GOOGLE_CLIENT_SECRET),
    hasFal: Boolean(raw.FAL_KEY),
    hasEmail: Boolean(raw.RESEND_API_KEY),
    dailyBudgetUsdMicro: Math.round(raw.DAILY_BUDGET_USD * 1_000_000),
  };
}

export type ServerEnv = ReturnType<typeof loadServerEnv>;

// Lazily memoised so importing this module in a client bundle by accident
// fails loudly at call time rather than at build time.
let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (!cached) cached = loadServerEnv();
  return cached;
}

/**
 * Public config, safe to send to the browser. Next inlines `NEXT_PUBLIC_*` at
 * build time, so these must be referenced as full literal property accesses.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
} as const;
