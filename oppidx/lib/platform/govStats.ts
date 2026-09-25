/**
 * Real government figures for /pulse, pulled from data.gov.in's official
 * API — India's Open Government Data platform. No AI, no fabrication: if
 * DATA_GOV_IN_API_KEY isn't configured, or a resource has no mapped ID yet,
 * this returns nothing rather than ever inventing a number.
 *
 * To activate a category:
 *  1. Sign up free at https://data.gov.in (account creation is not
 *     something this codebase or its automation should do on your behalf).
 *  2. Get your API key from your account page.
 *  3. Set DATA_GOV_IN_API_KEY in the environment.
 *  4. Find the dataset you want in the catalog (data.gov.in/catalogs) and
 *     add its resource ID to DATASETS below.
 *
 * Most Indian government datasets (NCRB crime stats, UDISE+ education
 * data, sanitation surveys) publish annually or quarterly, not daily —
 * that's a reality of the source data, not a limitation of this pipeline.
 * We still refresh on the same daily cron as the news feed so a genuinely
 * updated figure never sits stale for longer than a day, but the `as_of`
 * field always carries the real reporting period, never today's date.
 */

interface DatasetConfig {
  category: string;
  label: string;
  resourceId: string;
  sourceName: string;
  sourceUrl: string;
  // Extracts { value, unit, asOf } from one API response record.
  // Left per-dataset because data.gov.in field names vary by dataset.
  extract: (record: Record<string, string>) => { value: string; unit: string; asOf: string } | null;
}

// Empty on purpose — no resource IDs have been verified against a live
// API key yet. Add entries here once DATA_GOV_IN_API_KEY is configured
// and a real dataset has been picked from the catalog.
const DATASETS: DatasetConfig[] = [];

export interface GovDatapoint {
  category: string;
  label: string;
  value: string;
  unit: string;
  asOf: string;
  sourceName: string;
  sourceUrl: string;
}

export async function fetchGovDatapoints(): Promise<GovDatapoint[]> {
  const apiKey = process.env.DATA_GOV_IN_API_KEY;
  if (!apiKey || DATASETS.length === 0) return [];

  const results: GovDatapoint[] = [];
  for (const ds of DATASETS) {
    try {
      const res = await fetch(
        `https://api.data.gov.in/resource/${ds.resourceId}?api-key=${apiKey}&format=json&limit=1`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const record = data?.records?.[0];
      if (!record) continue;
      const extracted = ds.extract(record);
      if (!extracted) continue;
      results.push({
        category: ds.category,
        label: ds.label,
        value: extracted.value,
        unit: extracted.unit,
        asOf: extracted.asOf,
        sourceName: ds.sourceName,
        sourceUrl: ds.sourceUrl,
      });
    } catch (e) {
      console.error(`[govStats] failed to fetch ${ds.label}:`, e instanceof Error ? e.message : e);
    }
  }
  return results;
}
