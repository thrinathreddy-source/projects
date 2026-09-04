import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Runtime-tunable configuration.
 *
 * Credit pricing, the daily spend cap and the kill switches all need to change
 * faster than a deploy cycle — if a provider doubles its price on a Sunday, the
 * fix is an admin toggle, not a PR. Values live in `app_setting`; this module
 * supplies the defaults, the validation and a short read-through cache.
 */

const settingsSchema = z.object({
  /** Credits charged per second of PREVIEW-tier video. */
  "credits.previewPerSecond": z.number().int().min(0).max(1000),
  /** Credits charged per second of FINAL-tier video. */
  "credits.finalPerSecond": z.number().int().min(0).max(1000),
  /** Floor, so a very short clip still covers its fixed overhead. */
  "credits.minimumCharge": z.number().int().min(0).max(1000),
  /** Extra credits for adding narration to a clip. */
  "credits.voiceSurcharge": z.number().int().min(0).max(1000),
  /**
   * Credits for one still. Deliberately tiny — this is the cheap iteration
   * step, and pricing it near-free is what keeps wrong ideas from becoming
   * expensive video renders.
   */
  "credits.stillCharge": z.number().int().min(0).max(1000),

  /** Credits released when a new account verifies its email. Zero by default. */
  "signup.grantCredits": z.number().int().min(0).max(100_000),

  /** Hard ceiling on provider spend per UTC day, in USD micros. */
  "budget.dailyUsdMicro": z.number().int().min(0),

  /** How long a worker may hold a job before the lease is reclaimable. */
  "queue.leaseSeconds": z.number().int().min(30).max(3600),
  "queue.maxAttempts": z.number().int().min(1).max(10),
  /** Jobs a single worker tick will pick up. Keeps serverless invocations short. */
  "queue.batchSize": z.number().int().min(1).max(50),

  /** Reuse a previous render when the parameters hash identically. */
  "cache.enabled": z.boolean(),

  // --- Unit economics inputs -----------------------------------------------
  // These turn raw revenue and provider cost into a real margin. They are
  // settings rather than constants because every one of them moves: the rupee
  // moves, Razorpay's rate card moves, R2's pricing moves.

  /** Rupees per US dollar, for reporting mixed-currency revenue in one unit. */
  "fx.inrPerUsd": z.number().positive().max(1000),
  /** Payment processing take, as a percentage. Razorpay ~2% + 18% GST on it. */
  "costs.paymentFeePercent": z.number().min(0).max(100),
  /** Storage, bandwidth and support, amortised per minute of finished video. */
  "costs.overheadPerMinuteUsdMicro": z.number().int().min(0),

  /** Kill switches. */
  "flags.generationEnabled": z.boolean(),
  "flags.signupsEnabled": z.boolean(),
  "flags.billingEnabled": z.boolean(),
});

export type SettingKey = keyof z.infer<typeof settingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

function defaults(): Settings {
  return {
    // Derived from real model prices, not guessed. Standard is Wan at
    // $0.05/s and Master is Kling at $0.10/s; at ~Rs.88/USD and ~Rs.1.11 of
    // retail value per credit, these rates hold gross margin around 72%.
    // Change the model in `providers/fal.ts` and these must move with it.
    "credits.previewPerSecond": 14,
    "credits.finalPerSecond": 28,
    "credits.minimumCharge": 24,
    "credits.voiceSurcharge": 4,
    "credits.stillCharge": 4,

    // Nothing. Demonstrations do the selling instead.
    //
    // Free credits are the only place we spend before earning, and at ~₹5.28 a
    // signup that is a bill paid to strangers with no obligation to convert.
    // A bootstrapped business cannot fund the top of its own funnel, so the
    // published showcase carries the persuasion and every render is paid for.
    //
    // Runtime-editable: raise it in admin once there is margin to spend, and
    // the signup flow, verification email and banner all follow automatically.
    "signup.grantCredits": 0,

    "budget.dailyUsdMicro": env().dailyBudgetUsdMicro,

    "queue.leaseSeconds": 300,
    "queue.maxAttempts": 3,
    "queue.batchSize": 5,

    "cache.enabled": true,

    "fx.inrPerUsd": 88,
    "costs.paymentFeePercent": 2.36,
    "costs.overheadPerMinuteUsdMicro": 3_000, // $0.003 per finished minute

    "flags.generationEnabled": true,
    "flags.signupsEnabled": true,
    "flags.billingEnabled": true,
  };
}

// Read-through cache. Settings change rarely and are read on every generation,
// so a few seconds of staleness is a good trade for skipping a query per call.
const CACHE_TTL_MS = 10_000;
let cache: { values: Settings; expiresAt: number } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && cache.expiresAt > Date.now()) return cache.values;

  const values = defaults();

  try {
    const rows = await db.appSetting.findMany();
    for (const row of rows) {
      const key = row.key as SettingKey;
      const fieldSchema = settingsSchema.shape[key];
      if (!fieldSchema) continue; // unknown key left over from an old release

      const parsed = fieldSchema.safeParse(row.value);
      if (parsed.success) {
        // Assignment is safe: the key and its parsed value come from the same
        // schema entry, but TS cannot express that correlation.
        (values as Record<string, unknown>)[key] = parsed.data;
      } else {
        logger.warn("api", `Ignoring invalid app_setting "${key}"`, {
          issues: parsed.error.issues,
        });
      }
    }
  } catch (error) {
    // A settings read failure must not break generation — fall back to defaults.
    logger.error("api", "Failed to load app settings, using defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  cache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
  return values;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const settings = await getSettings();
  return settings[key];
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: Settings[K],
  updatedBy?: string,
): Promise<void> {
  const parsed = settingsSchema.shape[key].safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid value for setting "${key}"`);
  }

  const value_ = parsed.data as Prisma.InputJsonValue;

  await db.appSetting.upsert({
    where: { key },
    create: { key, value: value_, updatedBy },
    update: { value: value_, updatedBy },
  });

  invalidateSettingsCache();
}

export function invalidateSettingsCache() {
  cache = null;
}

/** Shape used by the admin settings form. */
export function settingsMetadata(): {
  key: SettingKey;
  label: string;
  kind: "number" | "boolean";
  help: string;
}[] {
  return [
    {
      key: "credits.previewPerSecond",
      label: "Preview credits / second",
      kind: "number",
      help: "A 5-second preview costs 5× this.",
    },
    {
      key: "credits.finalPerSecond",
      label: "Final credits / second",
      kind: "number",
      help: "Full-quality re-render rate.",
    },
    {
      key: "credits.minimumCharge",
      label: "Minimum charge",
      kind: "number",
      help: "Floor per generation, covering fixed overhead.",
    },
    {
      key: "credits.voiceSurcharge",
      label: "Narration surcharge",
      kind: "number",
      help: "Added when a voice other than “none” is selected.",
    },
    {
      key: "credits.stillCharge",
      label: "Credits per still",
      kind: "number",
      help: "Stage one. Keep this cheap — it is where users iterate.",
    },
    {
      key: "signup.grantCredits",
      label: "Signup grant",
      kind: "number",
      help: "Credits granted on email verification. Zero means renders are paid for from the first one.",
    },
    {
      key: "budget.dailyUsdMicro",
      label: "Daily budget (USD micros)",
      kind: "number",
      help: "30000000 = $30. Jobs defer to tomorrow past this.",
    },
    {
      key: "queue.leaseSeconds",
      label: "Job lease (seconds)",
      kind: "number",
      help: "A job held longer than this is reclaimed by another worker.",
    },
    {
      key: "queue.maxAttempts",
      label: "Max attempts",
      kind: "number",
      help: "Retries before a job is dead-lettered and credits refunded.",
    },
    {
      key: "queue.batchSize",
      label: "Worker batch size",
      kind: "number",
      help: "Jobs claimed per worker tick.",
    },
    {
      key: "cache.enabled",
      label: "Render cache",
      kind: "boolean",
      help: "Reuse renders when parameters match exactly.",
    },
    {
      key: "fx.inrPerUsd",
      label: "INR per USD",
      kind: "number",
      help: "Used to report mixed-currency revenue in one unit.",
    },
    {
      key: "costs.paymentFeePercent",
      label: "Payment fee (%)",
      kind: "number",
      help: "Razorpay's take including GST. Subtracted from revenue.",
    },
    {
      key: "costs.overheadPerMinuteUsdMicro",
      label: "Overhead / minute (USD micros)",
      kind: "number",
      help: "Storage, bandwidth and support per finished minute. 3000 = $0.003.",
    },
    {
      key: "flags.generationEnabled",
      label: "Generation enabled",
      kind: "boolean",
      help: "Off = new jobs are rejected. Use when a provider is down.",
    },
    {
      key: "flags.signupsEnabled",
      label: "Signups enabled",
      kind: "boolean",
      help: "Off = no new accounts.",
    },
    {
      key: "flags.billingEnabled",
      label: "Billing enabled",
      kind: "boolean",
      help: "Off = checkout is hidden.",
    },
  ];
}
