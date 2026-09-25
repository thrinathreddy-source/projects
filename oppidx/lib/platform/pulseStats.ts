/**
 * Editorial framing for each Pulse category — context copy only, no
 * numbers. The actual headlines and figures are real and live in
 * Supabase (pulse_headlines, pulse_datapoints), refreshed daily by
 * lib/pulseFeed.ts and lib/govStats.ts. Category keys here must match
 * the classifier output in lib/pulseFeed.ts exactly.
 */

export interface PulseCategoryInfo {
  category: string;
  sym: string;
  whyItMatters: string;
}

export const PULSE_CATEGORIES: PulseCategoryInfo[] = [
  { category: "Health & Sanitation", sym: "◆", whyItMatters: "Public health infrastructure is the baseline a developed country is judged on." },
  { category: "Education & Skilling", sym: "✦", whyItMatters: "Every dropout or unskilled graduate is a compounding loss a decade from now." },
  { category: "Women & Child Welfare", sym: "❋", whyItMatters: "How a country treats its most vulnerable is the clearest signal of where it actually stands." },
  { category: "Rural Development", sym: "◈", whyItMatters: "Most of the country still lives here — this is where the real gap between policy and daily life shows up first." },
  { category: "Agriculture", sym: "✧", whyItMatters: "The sector employing the most people gets the least visibility in most news cycles." },
  { category: "Environment & Cleanliness", sym: "◆", whyItMatters: "Air, water, and waste aren't lifestyle choices — they're the infrastructure everything else depends on." },
  { category: "Infrastructure", sym: "✦", whyItMatters: "Roads, digitisation, and connectivity are what actually let opportunity reach beyond a handful of cities." },
  { category: "Governance & Welfare Schemes", sym: "❋", whyItMatters: "A scheme nobody knows about might as well not exist — awareness is half of implementation." },
  { category: "Markets & Business", sym: "✧", whyItMatters: "What companies and markets are doing shapes jobs and prices long before it shows up in a policy speech." },
  { category: "National Development", sym: "◈", whyItMatters: "The everyday work of running a country, one ministry at a time." },
];

export function categoryInfo(category: string): PulseCategoryInfo {
  return (
    PULSE_CATEGORIES.find((c) => c.category === category) || {
      category,
      sym: "◆",
      whyItMatters: "",
    }
  );
}
