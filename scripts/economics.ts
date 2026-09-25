import "dotenv/config";
import { PLANS, CREDIT_PACKS } from "../src/lib/plans";
import {
  COGS,
  FIXED_COSTS,
  INR_PER_USD,
  PAYMENT_FEE_PERCENT,
  actionCosts,
  breakEvenCustomers,
  fixedMonthlyUsd,
  freeTierExposure,
  showcaseProductionCost,
  showcaseCrossoverSignups,
  cogsPerCredit,
  minuteOfContent,
  cohortProfit,
  planEconomics,
  usdMicroToInr,
} from "../src/lib/economics";

/**
 * The financial model — `npm run economics`.
 *
 * Reads the same constants the product bills with, so it cannot drift from
 * reality the way a spreadsheet does. Run it after changing a credit rate or a
 * provider and the margin consequences are immediate.
 */

// Mirrors the defaults in `lib/settings.ts`. An admin can override these at
// runtime; this reports the shipped baseline.
const RATES = {
  still: 4,
  previewPerSecond: 14,
  finalPerSecond: 28,
  voiceSurcharge: 4,
} as const;

/**
 * Zero: credits are bought, not granted. The showcase does the convincing.
 *
 * Kept as a named constant rather than deleted, because it is a runtime setting
 * an admin can raise once there is margin to spend — and this report has to
 * still be able to answer what that would cost.
 */
const SIGNUP_GRANT = 0;

/** The demonstrations that replaced the free tier, and what producing them costs. */
const SHOWCASE_PLAN = {
  clips: 8,
  secondsPerClip: 5,
  // Nobody keeps the first still. Budgeting one per clip would not be budgeting
  // for the iteration that makes them worth publishing.
  stillsPerClip: 6,
  narrated: true,
} as const;

const rs = (n: number) => `Rs.${n.toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const rule = (title: string) =>
  console.log(`\n${"─".repeat(74)}\n${title}\n${"─".repeat(74)}`);

// ---------------------------------------------------------------------------

rule("1. VENDOR PIPELINE — what we pay, and when");

console.log("\nPer use (only ever incurred after a user spends credits):\n");
const perUse = [
  ["fal.ai / Illustrious", "one still", usdMicroToInr(COGS.stillUsdMicro)],
  ["fal.ai / Wan 2.6", "motion, per second", usdMicroToInr(COGS.motionPreviewUsdMicroPerSec)],
  ["fal.ai / Kling 3.0", "motion, per second", usdMicroToInr(COGS.motionFinalUsdMicroPerSec)],
  ["fal.ai / TTS", "narration, per clip", usdMicroToInr(COGS.narrationUsdMicro)],
  ["Cloudflare R2", "storage, per clip", usdMicroToInr(COGS.storagePerClipUsdMicro)],
] as const;
for (const [vendor, unit, inr] of perUse) {
  console.log(`  ${vendor.padEnd(24)} ${unit.padEnd(22)} ${rs(inr).padStart(9)}`);
}
console.log(`\n  Razorpay                 per transaction        ${PAYMENT_FEE_PERCENT}%`);

console.log("\nFixed monthly, owed whether anyone buys or not:\n");
console.log(`  ${"".padEnd(18)} ${"".padEnd(34)} launch   at scale`);
for (const cost of FIXED_COSTS) {
  console.log(
    `  ${cost.vendor.padEnd(18)} ${cost.launchNote.padEnd(34)} ` +
      `${("$" + cost.launchUsd).padStart(6)}   ${("$" + cost.scaleUsd).padStart(7)}`,
  );
}

const fixedInr = fixedMonthlyUsd() * INR_PER_USD;
const fixedScaleInr = fixedMonthlyUsd("scale") * INR_PER_USD;

console.log(
  `\n  TOTAL FIXED        ${("$" + fixedMonthlyUsd()).padStart(21)}   ` +
    `${("$" + fixedMonthlyUsd("scale")).padStart(7)}`,
);
console.log(
  `                     ${rs(fixedInr).padStart(21)}   ${rs(fixedScaleInr).padStart(7)}  per month`,
);
console.log(
  "\n  Launch runs on free tiers everywhere except Vercel, whose Hobby plan\n" +
    "  forbids commercial use. Budgeting the scale column before there are\n" +
    "  customers is how a break-even of 3 becomes a break-even of 9.\n",
);

// ---------------------------------------------------------------------------

rule("2. UNIT ECONOMICS — margin on each thing a user can do");

console.log("\n  Action                    Credits   Revenue      COGS    Margin\n");
for (const action of actionCosts(RATES)) {
  // Revenue valued at the Creator plan's rate, the realistic middle.
  const revenue = action.credits * (999 / 900);
  const margin = revenue > 0 ? (revenue - action.cogsInr) / revenue : 0;
  console.log(
    `  ${action.action.padEnd(24)} ${String(action.credits).padStart(6)}` +
      `  ${rs(revenue).padStart(9)} ${rs(action.cogsInr).padStart(9)}   ${pct(margin).padStart(6)}`,
  );
}

console.log(
  "\n  The still is the cheap loop: a user can re-roll it ~20 times for what\n" +
    "  one motion render costs. That ratio is the whole cost strategy.",
);

// ---------------------------------------------------------------------------

rule("3. PLANS — worst case, every credit burned on motion");

console.log("\n  Plan       Price    Credits   Rs./credit      COGS   Fee   Profit  Margin\n");
let creatorProfit = 0;
for (const plan of PLANS) {
  const e = planEconomics(plan, RATES);
  if (plan.code === "creator") creatorProfit = e.grossProfitInr;
  console.log(
    `  ${e.name.padEnd(9)} ${rs(e.priceInr).padStart(8)} ${String(e.credits).padStart(8)}` +
      ` ${rs(e.revenuePerCreditInr).padStart(11)} ${rs(e.fullBurnCogsInr).padStart(9)}` +
      ` ${rs(e.paymentFeeInr).padStart(6)} ${rs(e.grossProfitInr).padStart(8)} ${pct(e.grossMargin).padStart(7)}`,
  );
}

console.log("\n  Credit packs (one-time, no mandate friction):\n");
for (const pack of CREDIT_PACKS) {
  const priceInr = pack.priceMinorInr / 100;
  console.log(
    `  ${pack.name.padEnd(9)} ${rs(priceInr).padStart(8)} ${String(pack.credits).padStart(8)}` +
      ` ${rs(priceInr / pack.credits).padStart(11)}`,
  );
}

const cheapestPlanPerCredit = Math.min(
  ...PLANS.filter((p) => p.priceMinorInr > 0).map(
    (p) => p.priceMinorInr / 100 / p.monthlyCredits,
  ),
);
const cheapestPackPerCredit = Math.min(
  ...CREDIT_PACKS.map((p) => p.priceMinorInr / 100 / p.credits),
);
if (cheapestPackPerCredit <= cheapestPlanPerCredit) {
  console.log(
    `\n  WARNING: packs (${rs(cheapestPackPerCredit)}/credit) are cheaper than plans ` +
      `(${rs(cheapestPlanPerCredit)}/credit).\n  Nobody has an economic reason to subscribe.`,
  );
}

// ---------------------------------------------------------------------------

rule("4. TOP OF FUNNEL — what it costs to convince someone");

const showcase = showcaseProductionCost(SHOWCASE_PLAN);

console.log(
  `\n  Signup grant: ${SIGNUP_GRANT} credits. Nothing is rendered before it is paid for.\n`,
);

console.log("  The showcase, produced once:\n");
console.log(
  `    ${SHOWCASE_PLAN.clips} clips x ${SHOWCASE_PLAN.stillsPerClip} stills   ` +
    `${rs(showcase.stillsInr).padStart(10)}`,
);
console.log(
  `    ${SHOWCASE_PLAN.clips} clips x ${SHOWCASE_PLAN.secondsPerClip}s motion   ` +
    `${rs(showcase.motionInr).padStart(10)}`,
);
console.log(`    narration            ${rs(showcase.narrationInr).padStart(10)}`);
console.log(`    ${"".padEnd(20)} ${rs(showcase.totalInr).padStart(10)}  ONE TIME\n`);

// What the old model would have cost for the same job.
const oldGrant = freeTierExposure(20, RATES, { motionAllowed: false });
const crossover = showcaseCrossoverSignups(showcase.totalInr, oldGrant.worstCaseInr);

console.log("  Against the free tier it replaced (20 credits, stills only):\n");
console.log(`    per signup, forever   ${rs(oldGrant.worstCaseInr)}`);
console.log(`    breaks even after     ${crossover} signups\n`);
console.log(
  `  Past ${crossover} signups the showcase is simply cheaper, and unlike a grant\n` +
    "  its cost does not grow with the thing we are trying to grow. Below that\n" +
    "  it is the price of not having an unbounded line item at all.\n",
);

console.log("  Cost to acquire one paying customer:\n");
console.log("    signups     old model (grant)    now (showcase amortised)");
for (const signups of [100, 500, 2_000]) {
  for (const rate of [5]) {
    const oldCac = oldGrant.costPerPayingCustomerInr(rate);
    const newCac = showcase.totalInr / (signups * (rate / 100));
    console.log(
      `    ${String(signups).padStart(7)}   ${rs(oldCac).padStart(16)}   ${rs(newCac).padStart(22)}`,
    );
  }
}
console.log("\n  (at 5% conversion)");

rule("5. BREAK-EVEN");

const customers = breakEvenCustomers(creatorProfit);
console.log(`\n  Fixed cost to cover        ${rs(fixedInr)}/mo`);
console.log(`  Gross profit per Creator   ${rs(creatorProfit)}/mo (worst case)`);
console.log(`  Paying customers needed    ${customers}`);
console.log(
  `\n  At ${customers} Creator subscribers the business pays for itself. Everything\n` +
    "  above that is profit, because variable cost is already covered per unit.",
);

rule("6. WHAT A CREDIT COSTS US");

const perCredit = cogsPerCredit(RATES);

console.log("\n  What the credit is spent on        our cost per credit\n");
console.log(`    Motion, Standard (${RATES.previewPerSecond}/sec)              ${rs(perCredit.motionPreview)}`);
console.log(`    Motion, Master   (${RATES.finalPerSecond}/sec)              ${rs(perCredit.motionFinal)}`);
console.log(`    Still            (${RATES.still} flat)               ${rs(perCredit.still)}`);
console.log(`    Narration        (${RATES.voiceSurcharge} flat)               ${rs(perCredit.narration)}`);

console.log(
  "\n  Both motion tiers cost the same per credit: Master is twice the price\n" +
    "  and twice the credits. Margin does not move with the tier a user picks.\n",
);

console.log("  Against what a credit sells for:\n");
console.log("    plan / pack        Rs./credit    our cost    profit    margin");
const sellables = [
  ...PLANS.filter((p) => p.priceMinorInr > 0).map((p) => ({
    name: p.name,
    perCredit: p.priceMinorInr / 100 / p.monthlyCredits,
  })),
  ...CREDIT_PACKS.map((p) => ({
    name: p.name,
    perCredit: p.priceMinorInr / 100 / p.credits,
  })),
];
for (const item of sellables) {
  const profit = item.perCredit - perCredit.motionPreview;
  console.log(
    `    ${item.name.padEnd(16)} ${rs(item.perCredit).padStart(10)}  ` +
      `${rs(perCredit.motionPreview).padStart(10)} ${rs(profit).padStart(9)}   ` +
      `${pct(profit / item.perCredit).padStart(6)}`,
  );
}

// ---------------------------------------------------------------------------

rule("7. ONE MINUTE OF FINISHED CONTENT");

console.log(
  "\n  A minute is several clips — plans cap one render at 5-15s — and each\n" +
    "  kept clip costs a few stills to get right. Assumes 4 stills per clip.\n",
);

console.log("    plan        clip len   clips   credits    our cost   plan gives");
for (const plan of PLANS.filter((p) => p.allowMotion)) {
  const minute = minuteOfContent(RATES, {
    clipSeconds: plan.maxDurationSec,
    stillsPerClip: 4,
    tier: "preview",
    narrated: true,
  });
  const minutesIncluded = plan.monthlyCredits / minute.credits;
  console.log(
    `    ${plan.name.padEnd(11)} ${String(plan.maxDurationSec + "s").padStart(7)}   ` +
      `${String(minute.clips).padStart(5)}   ${String(minute.credits).padStart(7)}   ` +
      `${rs(minute.cogsInr).padStart(9)}   ${minutesIncluded.toFixed(1)} min/mo`,
  );
}

console.log("\n  Same minute at Master quality:\n");
console.log("    plan        clip len   clips   credits    our cost   plan gives");
for (const plan of PLANS.filter((p) => p.allowFinal)) {
  const minute = minuteOfContent(RATES, {
    clipSeconds: plan.maxDurationSec,
    stillsPerClip: 4,
    tier: "final",
    narrated: true,
  });
  const minutesIncluded = plan.monthlyCredits / minute.credits;
  console.log(
    `    ${plan.name.padEnd(11)} ${String(plan.maxDurationSec + "s").padStart(7)}   ` +
      `${String(minute.clips).padStart(5)}   ${String(minute.credits).padStart(7)}   ` +
      `${rs(minute.cogsInr).padStart(9)}   ${minutesIncluded.toFixed(1)} min/mo`,
  );
}

// ---------------------------------------------------------------------------

rule("8. TOTAL PROFIT — worst case, every credit burned on motion");

const creator = PLANS.find((p) => p.code === "creator")!;

console.log(`\n  Cohort of Creator subscribers at ${rs(creator.priceMinorInr / 100)}/mo:\n`);
console.log("     subs     revenue        COGS       fees      fixed         NET   margin");
for (const subs of [9, 25, 50, 100, 250, 500]) {
  const c = cohortProfit(creator, subs, perCredit.motionPreview);
  console.log(
    `    ${String(subs).padStart(5)}  ${rs(c.revenueInr).padStart(10)}  ` +
      `${rs(c.cogsInr).padStart(10)}  ${rs(c.feesInr).padStart(9)}  ` +
      `${rs(c.fixedInr).padStart(9)}  ${rs(c.netInr).padStart(10)}  ${pct(c.marginPercent / 100).padStart(6)}`,
  );
}

// The daily spend cap is a real ceiling, not a formality.
const dailyCapInr = 30 * INR_PER_USD;
const monthlyCapInr = dailyCapInr * 30;
const creatorMonthlyCogs = creator.monthlyCredits * perCredit.motionPreview;
const capSubs = Math.floor(monthlyCapInr / creatorMonthlyCogs);

console.log(
  `\n  Ceiling: the Rs.${dailyCapInr.toFixed(0)}/day spend cap allows ${rs(monthlyCapInr)}/mo of\n` +
    `  provider cost, which is ${capSubs} fully-burning Creator subscribers\n` +
    `  (about ${rs((creator.priceMinorInr / 100) * capSubs)}/mo revenue). Past that, jobs defer to the\n` +
    "  next day rather than overspending. Raise the cap deliberately.\n",
);

rule("9. A REALISTIC MIX — not everybody buys the middle tier");

/**
 * Paid-tier distributions skew hard to the cheapest option. Without our own
 * data this is an assumption, not a forecast — change it here and every number
 * below follows.
 */
const MIX = [
  { code: "starter", share: 0.6 },
  { code: "creator", share: 0.3 },
  { code: "studio", share: 0.1 },
] as const;

console.log(
  `\n  Assumed split: ${MIX.map((m) => `${(m.share * 100).toFixed(0)}% ${m.code}`).join(", ")}\n`,
);

console.log("     customers     revenue    gross profit    fixed          NET    ARPU");
for (const customers of [3, 10, 25, 50, 100, 250]) {
  let revenue = 0;
  let gross = 0;

  for (const entry of MIX) {
    const plan = PLANS.find((p) => p.code === entry.code)!;
    const count = customers * entry.share;
    const econ = planEconomics(plan, RATES);
    revenue += (plan.priceMinorInr / 100) * count;
    gross += econ.grossProfitInr * count;
  }

  const net = gross - fixedInr;
  console.log(
    `    ${String(customers).padStart(9)}  ${rs(revenue).padStart(10)}  ${rs(gross).padStart(13)}  ` +
      `${rs(fixedInr).padStart(9)}  ${rs(net).padStart(11)}  ${rs(revenue / customers).padStart(7)}`,
  );
}

// What it takes to clear the fixed bill on this mix.
const blendedProfit =
  MIX.reduce((total, entry) => {
    const plan = PLANS.find((p) => p.code === entry.code)!;
    return total + planEconomics(plan, RATES).grossProfitInr * entry.share;
  }, 0);

console.log(
  `\n  Blended gross profit per customer   ${rs(blendedProfit)}/mo` +
    `\n  Customers to cover fixed cost       ${Math.ceil(fixedInr / blendedProfit)}` +
    `\n  Showcase (${rs(showcase.totalInr)}) repaid by customer  ${Math.ceil(showcase.totalInr / blendedProfit)}\n`,
);

console.log(
  "  These are scenarios, not forecasts. There is no traffic, no conversion\n" +
    "  data and no churn figure yet — the only honest input is the cost side,\n" +
    "  and even that is an estimate until the first fal invoice arrives.\n",
);

rule("Figures marked ESTIMATE in lib/economics.ts need a real invoice.");
console.log();
