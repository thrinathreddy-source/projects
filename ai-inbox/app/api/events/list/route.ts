import { supabaseAdmin } from "@/lib/platform/supabase";

export async function GET() {
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  try {
    const { data: events, error } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, description, category, location, event_time, host_name, capacity")
      .eq("is_published", true)
      .eq("is_cancelled", false)
      .eq("is_listed", true)
      .gte("event_time", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .order("event_time", { ascending: true })
      .limit(100);

    if (error) throw error;

    const ids = (events || []).map(e => e.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: rsvps } = await supabaseAdmin
        .from("event_rsvps")
        .select("event_id")
        .in("event_id", ids)
        .eq("waitlisted", false);
      for (const r of rsvps || []) counts[r.event_id] = (counts[r.event_id] || 0) + 1;
    }

    const out = (events || []).map(({ id, ...rest }) => ({ ...rest, rsvpCount: counts[id] || 0 }));

    return Response.json({ events: out });
  } catch (e) {
    console.error("[events/list]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't load events." }, { status: 500 });
  }
}
