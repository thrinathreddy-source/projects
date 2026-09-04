import { supabaseAdmin } from "@/lib/platform/supabase";

export async function GET() {
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  try {
    const { data: headlines, error: hErr } = await supabaseAdmin
      .from("pulse_headlines")
      .select("id, title, url, category, source, source_type, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(60);
    if (hErr) throw hErr;

    const { data: datapoints, error: dErr } = await supabaseAdmin
      .from("pulse_datapoints")
      .select("category, label, value, unit, as_of, source_name, source_url, fetched_at")
      .order("category", { ascending: true });
    if (dErr) throw dErr;

    const lastFetched = headlines?.[0]?.fetched_at || null;

    return Response.json({ headlines: headlines || [], datapoints: datapoints || [], lastFetched });
  } catch (e) {
    console.error("[pulse/data]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't load Pulse data." }, { status: 500 });
  }
}
