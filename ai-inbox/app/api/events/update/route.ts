import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, safeCompare, checkSize } from "@/lib/platform/security";
import { checkContentSafety } from "@/lib/platform/moderation";

const CATEGORIES = ["Party", "Meetup", "Workshop", "Talk", "Gathering", "Sport", "Other"];

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 16_384);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-update", ip, 20, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const slug  = sanitise(body.slug);
    const token = sanitise(body.token);
    if (!slug || !token) return Response.json({ error: "Missing slug or token." }, { status: 400 });

    const title       = sanitise(body.title);
    const description = sanitise(body.description);
    const location     = sanitise(body.location);
    const category    = sanitise(body.category) || "Gathering";
    const eventTime   = typeof body.eventTime === "string" ? body.eventTime : "";
    const capacityRaw = body.capacity;
    const capacity    = capacityRaw === "" || capacityRaw === null || capacityRaw === undefined
      ? null
      : Math.trunc(Number(capacityRaw));

    if (!title || !description || !location || !eventTime) {
      return Response.json({ error: "Title, description, location, and time are required." }, { status: 400 });
    }
    if (title.length < 3 || title.length > 120) {
      return Response.json({ error: "Title must be 3–120 characters." }, { status: 400 });
    }
    if (description.length > 1000) {
      return Response.json({ error: "Description is too long." }, { status: 400 });
    }
    if (!CATEGORIES.includes(category)) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }
    const when = new Date(eventTime);
    if (isNaN(when.getTime())) {
      return Response.json({ error: "Invalid event time." }, { status: 400 });
    }
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 100_000)) {
      return Response.json({ error: "Capacity must be a positive number." }, { status: 400 });
    }

    const modCheck = await checkContentSafety([title, description]);
    if (modCheck.flagged) {
      return Response.json({ error: "Couldn't save — please keep it respectful and free of explicit or violent content." }, { status: 400 });
    }

    if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

    const { data: event, error: findErr } = await supabaseAdmin
      .from("events")
      .select("id, manage_token")
      .eq("slug", slug)
      .single();

    if (findErr || !event || !safeCompare(event.manage_token, token)) {
      return Response.json({ error: "Not authorised." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("events")
      .update({
        title, description, location, category,
        event_time: when.toISOString(),
        capacity,
        is_listed: Boolean(body.isListed),
      })
      .eq("id", event.id);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (e) {
    console.error("[events/update]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't update your event." }, { status: 500 });
  }
}
