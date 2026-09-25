import { supabaseAdmin } from "@/lib/platform/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  try {
    const { slug } = await params;

    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, description, category, location, event_time, host_name, is_published, is_cancelled, capacity")
      .eq("slug", slug)
      .single();

    if (error || !event || !event.is_published) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }

    // Counts only — guest identities are never exposed on the public page.
    // Matches how real invite apps (Partiful, Doorlist) work: only the host
    // sees who's coming, via the token-gated /manage view.
    const { data: rsvps } = await supabaseAdmin
      .from("event_rsvps")
      .select("waitlisted")
      .eq("event_id", event.id);

    const going = (rsvps || []).filter((r) => !r.waitlisted);
    const waitlistCount = (rsvps || []).length - going.length;

    const { id, ...publicEvent } = event;
    void id;

    return Response.json({
      event: {
        ...publicEvent,
        rsvpCount: going.length,
        waitlistCount,
        isFull: event.capacity !== null && going.length >= event.capacity,
      },
    });
  } catch (e) {
    console.error("[events/detail]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't load this event." }, { status: 500 });
  }
}
