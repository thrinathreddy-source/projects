import { supabaseAdmin } from "@/lib/platform/supabase";
import { secureCompare } from "@/lib/secureCompare"
import { getAllHeadlines, SUPPORTED_COUNTRIES } from "@/lib/platform/pulseFeed";
import { fetchGovDatapoints } from "@/lib/platform/govStats";

// ─── DAILY PULSE REFRESH JOB ──────────────────────────────────────────────────
// Runs once a day (see vercel.json). Pulls real headlines from every
// configured country's government/regulatory (and, where verified,
// newspaper) sources — see lib/platform/pulseFeed.ts's COUNTRY_SOURCES —
// plus real figures from data.gov.in if configured. No AI, no fabrication —
// pure fetch + keyword classification. Protected by CRON_SECRET header,
// same pattern as /api/match/find.
//
// Requires supabase-schema-pulse-v5.sql to have been run first (adds
// pulse_headlines.country) — degrades to failing the headlines block with
// a clear error rather than silently mis-tagging every row IN if that
// migration hasn't landed yet.
// ───────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not set up yet." }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!supabaseAdmin) return Response.json({ error: "Server config error." }, { status: 500 });

  let headlineCount = 0;
  let datapointCount = 0;
  const errors: string[] = [];

  // Whether pulse_headlines.country exists yet (supabase-schema-pulse-v5.sql)
  // — checked once, not per row. Until that migration is run, this cron
  // must keep writing exactly what it always has (India's rows, no country
  // column) rather than hard-failing every row and taking down ingestion
  // that worked fine yesterday.
  let hasCountryColumn = true;

  for (const country of SUPPORTED_COUNTRIES) {
    try {
      const headlines = await getAllHeadlines(country);
      for (const h of headlines) {
        const row: Record<string, string> = {
          title: h.title, url: h.url, category: h.category,
          source: h.source, source_type: h.sourceType,
          fetched_at: new Date().toISOString(),
        };
        if (hasCountryColumn) row.country = h.country;

        const { error } = await supabaseAdmin.from("pulse_headlines").upsert(row, { onConflict: "url" });
        if (error) {
          if (hasCountryColumn && error.message?.toLowerCase().includes("country")) {
            // Schema cache miss on the not-yet-migrated column — drop it
            // for the rest of this run and retry this one row once.
            hasCountryColumn = false;
            delete row.country;
            const retry = await supabaseAdmin.from("pulse_headlines").upsert(row, { onConflict: "url" });
            if (retry.error) throw retry.error;
          } else {
            throw error;
          }
        }
        headlineCount++;
      }
    } catch (e) {
      errors.push(`headlines[${country}]: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  if (!hasCountryColumn) {
    errors.push("pulse_headlines.country doesn't exist yet — run supabase-schema-pulse-v5.sql to tag new rows by country.");
  }

  try {
    // Bounded growth — drop anything not seen in 14 days.
    await supabaseAdmin
      .from("pulse_headlines")
      .delete()
      .lt("fetched_at", new Date(Date.now() - 14 * 86400_000).toISOString());
  } catch (e) {
    errors.push(`cleanup: ${e instanceof Error ? e.message : "unknown"}`);
  }

  try {
    const datapoints = await fetchGovDatapoints();
    for (const d of datapoints) {
      const { error } = await supabaseAdmin.from("pulse_datapoints").upsert({
        category: d.category,
        label: d.label,
        value: d.value,
        unit: d.unit,
        as_of: d.asOf,
        source_name: d.sourceName,
        source_url: d.sourceUrl,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "category,label" });
      if (error) throw error;
      datapointCount++;
    }
  } catch (e) {
    errors.push(`datapoints: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return Response.json({
    success: errors.length === 0,
    headlineCount,
    datapointCount,
    errors: errors.length ? errors : undefined,
  });
}
