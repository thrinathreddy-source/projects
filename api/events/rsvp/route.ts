import { supabaseAdmin } from "@/lib/platform/supabase";
import { encrypt } from "@/lib/platform/encryption";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";
import { checkContentSafety } from "@/lib/platform/moderation";
import { checkinCode } from "@/lib/platform/ids";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 8_192);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-rsvp", ip, 20, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const slug    = sanitise(body.slug);
    const name    = sanitise(body.name);
    const contact = sanitise(body.contact);

    if (!slug || !name || !contact) {
      return Response.json({ error: "Name and a way to reach you are required." }, { status: 400 });
    }
    if (name.length < 2 || name.length > 100) {
      return Response.json({ error: "Name must be 2–100 characters." }, { status: 400 });
    }

    const modCheck = await checkContentSafety([name]);
    if (modCheck.flagged) {
      return Response.json({ error: "Couldn't process your RSVP — please use your real name." }, { status: 400 });
    }

    if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

    const { data: event, error: eventErr } = await supabaseAdmin
      .from("events")
      .select("id, title, event_time, is_published, is_cancelled, capacity")
      .eq("slug", slug)
      .single();

    if (eventErr || !event || !event.is_published) {
      return Response.json({ error: "Event not found." }, { status: 404 });
    }
    if (event.is_cancelled) {
      return Response.json({ error: "This event was cancelled by the host." }, { status: 400 });
    }
    if (new Date(event.event_time).getTime() < Date.now()) {
      return Response.json({ error: "This event has already happened." }, { status: 400 });
    }

    let waitlisted = false;
    if (event.capacity !== null) {
      const { count } = await supabaseAdmin
        .from("event_rsvps")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("waitlisted", false);
      waitlisted = (count || 0) >= event.capacity;
    }

    const code = checkinCode();
    const { error } = await supabaseAdmin.from("event_rsvps").insert({
      event_id: event.id,
      name,
      contact_encrypted: encrypt(contact),
      checkin_code: code,
      waitlisted,
    });

    if (error) throw error;

    return Response.json({ success: true, checkinCode: code, eventTitle: event.title, waitlisted });
  } catch (e) {
    console.error("[events/rsvp]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't save your RSVP. Please try again." }, { status: 500 });
  }
}
