/**
 * The unit-economics model.
 *
 * Written as code rather than a spreadsheet so it reads the same constants the
 * product actually bills with. A pricing model kept in a document is wrong
 * within a month; this one breaks the build if a credit rate moves without the
 * margin being re-checked.
 *
 * The governing principle is that we should never hold inventory. Every rupee
 * of provider cost is incurred *after* a user has spent credits they already
 * paid for — so if nobody buys, we still own the product and owe nothing. The
 * only place that principle can leak is the free tier, which is why it is
 * modelled explicitly below rather than waved away as marketing spend.
 *
 * Every figure marked ESTIMATE needs truing up against a real invoice.
 */

// ---------------------------------------------------------------------------
// Variable cost — what one unit of output costs us at the vendor
// ---------------------------------------------------------------------------

/**
 * USD micros. Mirrors the specs in `providers/fal.ts` and `providers/image-fal.ts`.
 *
 * Checked against fal's published price list in August 2026. Anything still
 * marked ESTIMATE has not been seen on an invoice, and the rule for those is
 * to over-state rather than under-state: these figures drive the daily budget
 * guard, and a guard built on an optimistic cost stops guarding.
 */
export const COGS = {
  /** One still from an anime checkpoint. ESTIMATE. */
  stillUsdMicro: 12_000,
  /**
   * Motion, per second, budget tier (Wan). VERIFIED against fal's price list
   * in August 2026, which lists Wan at $0.05/s. Note the SKU there is Wan 2.5
   * while `providers/fal.ts` targets v2.6 — same family, close enough to trust
   * until an invoice says otherwise.
   */
  motionPreviewUsdMicroPerSec: 50_000,
  /**
   * Motion, per second, quality tier (Kling). ESTIMATE, and deliberately kept
   * high.
   *
   * fal's public list shows Kling 2.5 Turbo Pro at $0.07/s. `providers/fal.ts`
   * targets `kling-video/v3/standard`, which is a different SKU and is not on
   * that page, so this is not a like-for-like confirmation. $0.10 is held
   * because over-stating is the safe direction and because the true figure is
   * more likely below it than above — a third-party summary claiming $0.168/s
   * was checked and does not match fal's own pricing for any listed Kling.
   *
   * True this up from a real invoice before trusting the margin dashboard.
   */
  motionFinalUsdMicroPerSec: 100_000,
  /** Narration for one short clip. ESTIMATE — TTS is billed per character. */
  narrationUsdMicro: 8_000,
  /**
   * Storage plus bandwidth, amortised per finished clip. R2 charges for
   * storage but not egress, which is the entire reason it was chosen — a video
   * product on a gateway that bills egress has a completely different model.
   */
  storagePerClipUsdMicro: 400,
} as const;

// ---------------------------------------------------------------------------
// Fixed cost — what we owe each month before a single render happens
// ---------------------------------------------------------------------------

export type FixedCost = {
  vendor: string;
  purpose: string;
  /**
   * What this actually costs at launch volumes — usually the free tier.
   *
   * Modelling launch at list price is how a bootstrapped business talks itself
   * into needing five times the customers it needs.
   */
  launchUsd: number;
  /** What it costs once the free tier is outgrown. */
  scaleUsd: number;
  /** Why the launch figure is what it is, and what ends it. */
  launchNote: string;
  scalesWith: string;
};

export const FIXED_COSTS: readonly FixedCost[] = [
  {
    vendor: "Vercel",
    purpose: "Hosting, cron, function time",
    // The one that is genuinely not optional: Hobby forbids commercial use, so
    // a product that charges money is on Pro from day one.
    launchUsd: 20,
    scaleUsd: 20,
    launchNote: "Pro required — Hobby prohibits commercial use",
    scalesWith: "Traffic and render polling",
  },
  {
    vendor: "Neon",
    purpose: "Postgres",
    launchUsd: 0,
    scaleUsd: 19,
    launchNote: "Free tier: 0.5GB, autosuspends when idle",
    scalesWith: "Rows and compute hours",
  },
  {
    vendor: "Cloudflare R2",
    purpose: "Render storage",
    launchUsd: 0,
    scaleUsd: 5,
    launchNote: "Free tier: 10GB stored, egress always free",
    scalesWith: "Total stored video",
  },
  {
    vendor: "Resend",
    purpose: "Transactional email",
    launchUsd: 0,
    scaleUsd: 20,
    launchNote: "Free tier: 3,000/month, 100/day",
    scalesWith: "Signups and resets",
  },
  {
    vendor: "PostHog",
    purpose: "Product analytics",
    launchUsd: 0,
    scaleUsd: 0,
    launchNote: "Free tier: 1M events/month",
    scalesWith: "Events past the free tier",
  },
  {
    vendor: "Domain",
    purpose: "arka.tld",
    launchUsd: 2,
    scaleUsd: 2,
    launchNote: "Unavoidable",
    scalesWith: "Nothing",
  },
] as const;

/**
 * Fixed monthly cost, in USD.
 *
 * Defaults to launch because break-even is a launch question — what it takes to
 * stop losing money, not what it takes at scale, by which point revenue covers
 * the difference many times over.
 */
export const fixedMonthlyUsd = (mode: "launch" | "scale" = "launch") =>
  FIXED_COSTS.reduce(
    (total, cost) => total + (mode === "scale" ? cost.scaleUsd : cost.launchUsd),
    0,
  );

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** Rupees per US dollar. Mirrors the `fx.inrPerUsd` setting. */
export const INR_PER_USD = 88;

/** Razorpay's take including GST on the fee. */
export const PAYMENT_FEE_PERCENT = 2.36;

/**
 * GST on the subscription itself, at the SAC 9983 rate for software services.
 *
 * Not optional and not deferrable. Registration is mandatory from the first
 * transaction for inter-state supply, and selling online to customers across
 * India is inter-state from day one — the Rs.20 lakh threshold that applies to
 * a local business never applies here.
 *
 * Indian consumer pricing is quoted inclusive of tax, so a Rs.999 plan is
 * Rs.999 to the customer and Rs.846.61 to us. Modelling it any other way
 * overstates every margin on this page by about a fifth.
 */
export const GST_PERCENT = 18;

/** Revenue actually retained from a tax-inclusive price. */
export const netOfGst = (inclusiveInr: number) => inclusiveInr / (1 + GST_PERCENT / 100);

export const usdMicroToInr = (usdMicro: number) => (usdMicro / 1_000_000) * INR_PER_USD;

// ---------------------------------------------------------------------------
// Per-action economics
// ---------------------------------------------------------------------------

export type ActionCost = {
  action: string;
  credits: number;
  cogsInr: number;
};

/**
 * What each thing a user can do costs us, in rupees.
 *
 * `creditRates` comes from the live settings so this cannot drift from what is
 * actually charged.
 */
export function actionCosts(
  creditRates: {
    still: number;
    previewPerSecond: number;
    finalPerSecond: number;
    voiceSurcharge: number;
  },
  durationSec = 5,
): ActionCost[] {
  return [
    {
      action: "Still (stage one)",
      credits: creditRates.still,
      cogsInr: usdMicroToInr(COGS.stillUsdMicro),
    },
    {
      action: `Motion ${durationSec}s, standard`,
      credits: creditRates.previewPerSecond * durationSec,
      cogsInr: usdMicroToInr(
        COGS.motionPreviewUsdMicroPerSec * durationSec + COGS.storagePerClipUsdMicro,
      ),
    },
    {
      action: `Motion ${durationSec}s, master`,
      credits: creditRates.finalPerSecond * durationSec,
      cogsInr: usdMicroToInr(
        COGS.motionFinalUsdMicroPerSec * durationSec + COGS.storagePerClipUsdMicro,
      ),
    },
    {
      action: "Narration",
      credits: creditRates.voiceSurcharge,
      cogsInr: usdMicroToInr(COGS.narrationUsdMicro),
    },
  ];
}

// ---------------------------------------------------------------------------
// The free tier — the only place the zero-inventory principle can leak
// ---------------------------------------------------------------------------

export type FreeTierExposure = {
  creditsGranted: number;
  /** Worst case: every granted credit is spent on the most expensive thing. */
  worstCaseInr: number;
  /** What it costs to acquire one payer at a given conversion rate. */
  costPerPayingCustomerInr: (conversionPercent: number) => number;
};

/**
 * Free credits are the one cost we incur before any revenue exists.
 *
 * Modelled at worst case deliberately. Assuming the average free user is
 * frugal is how a free tier quietly becomes the largest line on the bill.
 */
export function freeTierExposure(
  creditsGranted: number,
  creditRates: { still: number; previewPerSecond: number },
  options: { motionAllowed: boolean } = { motionAllowed: true },
): FreeTierExposure {
  const perCreditInr = options.motionAllowed
    ? usdMicroToInr(COGS.motionPreviewUsdMicroPerSec * 5) /
      (creditRates.previewPerSecond * 5)
    : usdMicroToInr(COGS.stillUsdMicro) / creditRates.still;

  const worstCaseInr = creditsGranted * perCreditInr;

  return {
    creditsGranted,
    worstCaseInr,
    costPerPayingCustomerInr: (conversionPercent) =>
      conversionPercent <= 0 ? Infinity : worstCaseInr * (100 / conversionPercent),
  };
}

/**
 * What the published showcase costs to produce, once.
 *
 * This is what replaced the free tier. Free credits were a variable cost with
 * no ceiling — every signup drew from the budget whether or not they ever paid,
 * and the bill scaled with exactly the thing we wanted to grow. The showcase is
 * the same persuasion bought as a fixed cost: rendered once, shown to everyone,
 * and priced before it is incurred.
 *
 * `stillsPerClip` is the honest part. Nobody keeps the first still — the point
 * of a cheap iteration step is to use it — so a showcase that budgets one still
 * per clip is not budgeting for the work of making the clips good.
 */
export function showcaseProductionCost(options: {
  clips: number;
  secondsPerClip: number;
  stillsPerClip: number;
  narrated?: boolean;
}): { stillsInr: number; motionInr: number; narrationInr: number; totalInr: number } {
  const stillsInr = usdMicroToInr(
    COGS.stillUsdMicro * options.clips * options.stillsPerClip,
  );
  const motionInr = usdMicroToInr(
    COGS.motionPreviewUsdMicroPerSec * options.secondsPerClip * options.clips,
  );
  const narrationInr = options.narrated
    ? usdMicroToInr(COGS.narrationUsdMicro * options.clips)
    : 0;

  return {
    stillsInr,
    motionInr,
    narrationInr,
    totalInr: stillsInr + motionInr + narrationInr,
  };
}

/**
 * Signups at which a one-time showcase becomes cheaper than granting credits.
 *
 * The crossover is the argument for the switch: below it, free credits are the
 * cheaper way to convince people; above it, they are simply a larger bill for
 * the same job.
 */
export function showcaseCrossoverSignups(
  showcaseTotalInr: number,
  perSignupGrantInr: number,
): number {
  if (perSignupGrantInr <= 0) return Infinity;
  return Math.ceil(showcaseTotalInr / perSignupGrantInr);
}

/**
 * What one credit costs us, by what it is spent on.
 *
 * The credit rates were derived from model prices rather than picked, which is
 * why motion costs the same per credit at either tier: Master is twice the
 * price and twice the credits. That is the property that makes a credit a
 * stable unit of account — margin does not depend on which tier a user picks.
 */
export function cogsPerCredit(rates: {
  still: number;
  previewPerSecond: number;
  finalPerSecond: number;
  voiceSurcharge: number;
}): { still: number; motionPreview: number; motionFinal: number; narration: number } {
  return {
    still: usdMicroToInr(COGS.stillUsdMicro) / rates.still,
    motionPreview: usdMicroToInr(COGS.motionPreviewUsdMicroPerSec) / rates.previewPerSecond,
    motionFinal: usdMicroToInr(COGS.motionFinalUsdMicroPerSec) / rates.finalPerSecond,
    narration: usdMicroToInr(COGS.narrationUsdMicro) / rates.voiceSurcharge,
  };
}

export type MinuteOfContent = {
  clips: number;
  credits: number;
  cogsInr: number;
};

/**
 * What a finished minute actually consumes.
 *
 * Not 60 seconds of one render: plans cap a single clip at 5–15 seconds, so a
 * minute is several clips stitched together. And each kept clip costs several
 * stills, because the cheap iteration step only earns its place if it is used —
 * budgeting one still per clip would be budgeting for getting it right first
 * time, which nobody does.
 */
export function minuteOfContent(
  rates: { still: number; previewPerSecond: number; finalPerSecond: number; voiceSurcharge: number },
  options: {
    clipSeconds: number;
    stillsPerClip: number;
    tier: "preview" | "final";
    narrated: boolean;
  },
): MinuteOfContent {
  const clips = Math.ceil(60 / options.clipSeconds);
  const seconds = clips * options.clipSeconds;

  const perSecondCredits =
    options.tier === "final" ? rates.finalPerSecond : rates.previewPerSecond;
  const perSecondCogsUsdMicro =
    options.tier === "final"
      ? COGS.motionFinalUsdMicroPerSec
      : COGS.motionPreviewUsdMicroPerSec;

  const stillCredits = clips * options.stillsPerClip * rates.still;
  const motionCredits = seconds * perSecondCredits;
  const narrationCredits = options.narrated ? clips * rates.voiceSurcharge : 0;

  const cogsInr =
    usdMicroToInr(COGS.stillUsdMicro * clips * options.stillsPerClip) +
    usdMicroToInr(perSecondCogsUsdMicro * seconds) +
    (options.narrated ? usdMicroToInr(COGS.narrationUsdMicro * clips) : 0) +
    usdMicroToInr(COGS.storagePerClipUsdMicro * clips);

  return {
    clips,
    credits: stillCredits + motionCredits + narrationCredits,
    cogsInr,
  };
}

/**
 * Net profit for a cohort of identical subscribers, after everything.
 *
 * Worst case by construction: assumes every credit sold is burned on motion in
 * the month it is granted. Real usage is lower, and unburned credits are
 * revenue banked against a cost that may never arrive — but a plan has to
 * survive its worst month, not its average one.
 */
export function cohortProfit(
  plan: { priceMinorInr: number; monthlyCredits: number },
  subscribers: number,
  costPerCreditInr: number,
  paymentFeePercent = PAYMENT_FEE_PERCENT,
): {
  revenueInr: number;
  cogsInr: number;
  feesInr: number;
  fixedInr: number;
  netInr: number;
  marginPercent: number;
} {
  const collectedInr = (plan.priceMinorInr / 100) * subscribers;
  // GST is collected on our customers' behalf and remitted; it was never ours.
  const revenueInr = netOfGst(collectedInr);
  const cogsInr = plan.monthlyCredits * costPerCreditInr * subscribers;
  const feesInr = collectedInr * (paymentFeePercent / 100);
  const fixedInr = fixedMonthlyUsd() * INR_PER_USD;
  const netInr = revenueInr - cogsInr - feesInr - fixedInr;

  return {
    revenueInr,
    cogsInr,
    feesInr,
    fixedInr,
    netInr,
    marginPercent: revenueInr > 0 ? (netInr / revenueInr) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Plan economics
// ---------------------------------------------------------------------------

export type PlanEconomics = {
  name: string;
  priceInr: number;
  credits: number;
  revenuePerCreditInr: number;
  /** If the customer spends every credit on standard motion. */
  fullBurnCogsInr: number;
  paymentFeeInr: number;
  grossProfitInr: number;
  grossMargin: number;
};

export function planEconomics(
  plan: { name: string; priceMinorInr: number; monthlyCredits: number },
  creditRates: { previewPerSecond: number },
): PlanEconomics {
  const listPriceInr = plan.priceMinorInr / 100;
  // What the customer pays is not what we keep: the quoted price includes GST.
  const priceInr = netOfGst(listPriceInr);
  const credits = plan.monthlyCredits;

  // Cost per credit when spent on the standard motion tier — the expensive
  // realistic case. Stills are far cheaper, so this is a floor on margin.
  const costPerCreditInr =
    usdMicroToInr(COGS.motionPreviewUsdMicroPerSec * 5 + COGS.storagePerClipUsdMicro) /
    (creditRates.previewPerSecond * 5);

  const fullBurnCogsInr = credits * costPerCreditInr;
  // Razorpay's fee is charged on the amount collected, tax included.
  const paymentFeeInr = listPriceInr * (PAYMENT_FEE_PERCENT / 100);
  const grossProfitInr = priceInr - fullBurnCogsInr - paymentFeeInr;

  return {
    name: plan.name,
    priceInr: listPriceInr,
    credits,
    revenuePerCreditInr: credits > 0 ? priceInr / credits : 0,
    fullBurnCogsInr,
    paymentFeeInr,
    grossProfitInr,
    grossMargin: priceInr > 0 ? grossProfitInr / priceInr : 0,
  };
}

/** Paying customers needed to cover the fixed monthly bill. */
export function breakEvenCustomers(grossProfitPerCustomerInr: number): number {
  if (grossProfitPerCustomerInr <= 0) return Infinity;
  return Math.ceil((fixedMonthlyUsd() * INR_PER_USD) / grossProfitPerCustomerInr);
}
