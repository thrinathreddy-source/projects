import { supabaseAdmin } from "@/lib/platform/supabase";
import { safeCompare } from "@/lib/platform/security";

export async function GET(req: Request) {
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || "";
    const token = url.searchParams.get("token") || "";
    if (!slug || !token) return Response.json({ error: "Missing slug or token." }, { status: 400 });

    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, description, category, location, event_time, host_name, manage_token, capacity, is_cancelled, is_listed")
      .eq("slug", slug)
      .single();

    if (error || !event || !safeCompare(event.manage_token, token)) {
      return Response.json({ error: "Not found, or that link is wrong." }, { status: 404 });
    }

    const { data: rsvps } = await supabaseAdmin
      .from("event_rsvps")
      .select("id, name, checkin_code, checked_in, checked_in_at, waitlisted, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    const { manage_token, id, ...publicEvent } = event;
    void manage_token; void id;

    return Response.json({ event: publicEvent, guests: rsvps || [] });
  } catch (e) {
    console.error("[events/manage]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't load your event." }, { status: 500 });
  }
}
