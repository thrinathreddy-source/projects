/**
 * Plan and credit-pack catalog.
 *
 * There is deliberately no "unlimited" tier. Every generation costs us real
 * money, so every generation costs the user credits. A tier that promises
 * unlimited output either loses money on power users or hides a fair-use
 * clause; both are worse than being straightforward about credits.
 *
 * This file is the seed source. The `plan` table is authoritative at runtime so
 * an admin can change pricing or grants without a deploy.
 */

export type PlanCode = "free" | "starter" | "creator" | "studio";

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  description: string;
  /** Monthly price in minor units: paise for INR, cents for USD. */
  priceMinorInr: number;
  priceMinorUsd: number;
  monthlyCredits: number;
  /** Concurrent running jobs allowed. Caps our exposure to a single user. */
  maxConcurrent: number;
  maxDurationSec: number;
  /** Full-quality re-render, as opposed to the cheap preview pass. */
  allowFinal: boolean;
  /**
   * Whether this plan can spend credits on motion at all.
   *
   * False on Free, and that is the entire zero-inventory guarantee: a still
   * costs us about a rupee, a motion render about twenty-two. Letting free
   * accounts animate is the one way this business can spend real money on
   * someone who never pays.
   */
  allowMotion: boolean;
  /**
   * Whether the HTTP API is usable on this plan.
   *
   * Was advertised as a Studio feature and enforced nowhere, so every tier had
   * it. Either the claim goes or the gate does; the gate is the one worth
   * having, because programmatic access is what an agency is actually buying.
   */
  allowApi: boolean;
  sortOrder: number;
  /** Qualitative selling points only. Anything countable is derived by planOutcomes. */
  highlights: readonly string[];
};

export const PLANS: readonly PlanDefinition[] = [
  {
    code: "free",
    name: "Free",
    /**
     * An account, not an allowance.
     *
     * Signing up costs nothing and grants nothing: every credit is bought.
     * Free renders are the one cost incurred before any revenue exists, and a
     * bootstrapped business cannot fund the top of its own funnel — the public
     * showcase is what convinces people instead. This tier exists so someone
     * can hold an account, read the docs and top up when ready.
     */
    description: "Create an account and top up when you are ready. Credits are bought, not granted.",
    priceMinorInr: 0,
    priceMinorUsd: 0,
    monthlyCredits: 0,
    maxConcurrent: 1,
    maxDurationSec: 5,
    allowFinal: false,
    allowMotion: false,
    allowApi: false,
    sortOrder: 0,
    highlights: [
      "Buy credits from ₹299 — no subscription needed",
      "See what it makes in the showcase first",
      "All 8 styles, all 12 languages",
    ],
  },
  {
    code: "starter",
    name: "Starter",
    description: "For posting a few times a week.",
    priceMinorInr: 39_900, // ₹399
    priceMinorUsd: 500, // $5
    monthlyCredits: 300,
    maxConcurrent: 2,
    maxDurationSec: 10,
    allowFinal: true,
    allowMotion: true,
    allowApi: false,
    sortOrder: 1,
    highlights: [
      "Full-quality renders",
      "Credits never expire",
      "Commercial use included",
    ],
  },
  {
    code: "creator",
    name: "Creator",
    description: "For a daily posting habit.",
    priceMinorInr: 99_900, // ₹999
    priceMinorUsd: 1_200, // $12
    monthlyCredits: 900,
    maxConcurrent: 3,
    maxDurationSec: 15,
    allowFinal: true,
    allowMotion: true,
    allowApi: false,
    sortOrder: 2,
    highlights: [
      "Full-quality renders",
      "Credits never expire",
      "Commercial use included",
      "Priority over Starter in the queue",
    ],
  },
  {
    code: "studio",
    name: "Studio",
    description: "For teams and agencies shipping client work.",
    priceMinorInr: 249_900, // ₹2,499
    priceMinorUsd: 2_900, // $29
    monthlyCredits: 2_400,
    maxConcurrent: 5,
    maxDurationSec: 15,
    allowFinal: true,
    allowMotion: true,
    allowApi: true,
    sortOrder: 3,
    highlights: [
      "Full-quality renders",
      "Credits never expire",
      "Commercial use included",
      "Highest queue priority",
      "HTTP API for programmatic rendering",
    ],
  },
] as const;

const PLAN_BY_CODE = new Map(PLANS.map((plan) => [plan.code, plan]));

export function getPlan(code: string): PlanDefinition {
  return PLAN_BY_CODE.get(code as PlanCode) ?? PLANS[0];
}

export const FREE_PLAN = PLANS[0];

/**
 * One-time credit packs. These exist so a user who runs dry mid-month can top
 * up without upgrading — the single most common reason people churn.
 */
export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  priceMinorInr: number;
  priceMinorUsd: number;
  /** Marketing label, e.g. "Best value". Empty means none. */
  badge: string;
};

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "pack_200",
    name: "Top-up",
    credits: 200,
    priceMinorInr: 29_900,
    priceMinorUsd: 380,
    badge: "",
  },
  {
    id: "pack_600",
    name: "Bundle",
    credits: 600,
    priceMinorInr: 84_900,
    priceMinorUsd: 1_050,
    badge: "Most popular",
  },
  {
    id: "pack_1500",
    name: "Bulk",
    credits: 1_500,
    priceMinorInr: 199_900,
    priceMinorUsd: 2_400,
    badge: "Best value",
  },
] as const;

const PACK_BY_ID = new Map(CREDIT_PACKS.map((pack) => [pack.id, pack]));

export function getCreditPack(id: string): CreditPack | undefined {
  return PACK_BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// What a plan actually buys, in things rather than credits
// ---------------------------------------------------------------------------

export type CreditRates = {
  still: number;
  previewPerSecond: number;
  voiceSurcharge: number;
};

export type PlanOutcomes = {
  /** Finished clips a month, allowing a couple of drafts each. */
  clips: number;
  /** Length of one clip, in seconds. */
  clipSeconds: number;
  /** Stills, if the whole allowance goes on drawing and nothing is animated. */
  stills: number;
  /** Total seconds of animation if nothing is spent on stills. */
  motionSeconds: number;
};

/**
 * Translate an allowance of credits into what someone will actually get.
 *
 * A credit is our unit, not the customer's. Asking a buyer to divide by
 * fourteen to find out whether a plan covers their week is a tax on the
 * decision we most want them to make, so the pricing page states outcomes and
 * this computes them from the same numbers the app bills with — the table
 * cannot drift from the product because there is nothing to keep in sync.
 *
 * `draftsPerClip` is the honest thumb on the scale. Quoting clips as though
 * the first still is always kept would overstate every tier; two drafts is a
 * realistic floor for work someone intends to publish.
 */
export function planOutcomes(
  plan: PlanDefinition,
  rates: CreditRates,
  draftsPerClip = 2,
): PlanOutcomes {
  const clipSeconds = plan.maxDurationSec;

  const perClip =
    clipSeconds * rates.previewPerSecond +
    rates.voiceSurcharge +
    draftsPerClip * rates.still;

  return {
    clips: plan.allowMotion ? Math.floor(plan.monthlyCredits / perClip) : 0,
    clipSeconds,
    stills: Math.floor(plan.monthlyCredits / rates.still),
    motionSeconds: plan.allowMotion
      ? Math.floor(plan.monthlyCredits / rates.previewPerSecond)
      : 0,
  };
}
