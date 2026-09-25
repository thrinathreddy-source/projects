import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, safeCompare, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 4_096);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-checkin", ip, 60, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const slug  = sanitise(body.slug);
    const token = sanitise(body.token);
    const code  = sanitise(body.code).toUpperCase();

    if (!slug || !token || !code) {
      return Response.json({ error: "Missing slug, token, or code." }, { status: 400 });
    }
    if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

    const { data: event, error: eventErr } = await supabaseAdmin
      .from("events")
      .select("id, manage_token")
      .eq("slug", slug)
      .single();

    if (eventErr || !event || !safeCompare(event.manage_token, token)) {
      return Response.json({ error: "Not authorised." }, { status: 403 });
    }

    const { data: guest, error: guestErr } = await supabaseAdmin
      .from("event_rsvps")
      .select("id, name, checked_in")
      .eq("event_id", event.id)
      .eq("checkin_code", code)
      .single();

    if (guestErr || !guest) {
      return Response.json({ error: "No guest found with that code." }, { status: 404 });
    }
    if (guest.checked_in) {
      return Response.json({ success: true, alreadyCheckedIn: true, name: guest.name });
    }

    const { error } = await supabaseAdmin
      .from("event_rsvps")
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq("id", guest.id);
    if (error) throw error;

    return Response.json({ success: true, alreadyCheckedIn: false, name: guest.name });
  } catch (e) {
    console.error("[events/checkin]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't check in this guest." }, { status: 500 });
  }
}
