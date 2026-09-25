// Pure, client-safe region config — no server imports, so client components
// (like app/browse/BrowseClient.tsx) can pull REGION_ORDER without dragging
// prisma into the browser bundle. Mirrors the lib/collectionDefs.ts /
// lib/collections.ts split already used elsewhere in this codebase.

// The only values Opportunity.region is ever scraped/set to (see
// prisma/schema.prisma:40) — "" means unknown/unset and never gets a page.
export const REGION_ORDER = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania', 'Remote / Global']

export function slugifyRegion(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Real, distinct copy per region rather than one template with the name
// swapped in — avoids the near-duplicate-content pattern the rest of the
// collections/company pages already take care to avoid.
const REGION_BLURBS: Record<string, string> = {
  'North America': 'Roles and programs based in the US and Canada — internships, new-grad jobs, scholarships, and fellowships.',
  'South America': 'Opportunities based across South America, from internships to fellowships and grants.',
  'Europe': 'Roles and programs across Europe — internships, jobs, scholarships, and fellowships based in the region.',
  'Africa': 'Opportunities based across Africa, from internships to fellowships and grants.',
  'Asia': 'Roles and programs across Asia — internships, jobs, scholarships, and fellowships based in the region.',
  'Oceania': 'Opportunities based in Australia, New Zealand, and the wider Pacific.',
  'Remote / Global': 'Fully remote roles and programs — open regardless of where you live.',
}

export function regionBlurb(region: string): string {
  return REGION_BLURBS[region] ?? `Real, verified opportunities based in ${region}.`
}
