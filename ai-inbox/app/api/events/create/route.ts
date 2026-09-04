import { supabaseAdmin } from "@/lib/platform/supabase";
import { encrypt } from "@/lib/platform/encryption";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";
import { checkContentSafety } from "@/lib/platform/moderation";
import { slugify, manageToken } from "@/lib/platform/ids";

const CATEGORIES = ["Party", "Meetup", "Workshop", "Talk", "Gathering", "Sport", "Other"];

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 16_384);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-create", ip, 5, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();

    const title       = sanitise(body.title);
    const description = sanitise(body.description);
    const location    = sanitise(body.location);
    const hostName    = sanitise(body.hostName);
    const hostContact = sanitise(body.hostContact);
    const category    = sanitise(body.category) || "Gathering";
    const eventTime   = typeof body.eventTime === "string" ? body.eventTime : "";
    const capacityRaw = body.capacity;
    const capacity    = capacityRaw === "" || capacityRaw === null || capacityRaw === undefined
      ? null
      : Math.trunc(Number(capacityRaw));

    if (!title || !description || !location || !hostName || !hostContact || !eventTime) {
      return Response.json({ error: "Title, description, location, time, and your contact are required." }, { status: 400 });
    }
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 100_000)) {
      return Response.json({ error: "Capacity must be a positive number." }, { status: 400 });
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
    if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
      return Response.json({ error: "Event time must be a valid, upcoming date." }, { status: 400 });
    }

    const modCheck = await checkContentSafety([title, description, hostName]);
    if (modCheck.flagged) {
      return Response.json({ error: "Your event couldn't be published — please keep it respectful and free of explicit or violent content." }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return Response.json({ error: "Server error." }, { status: 500 });
    }

    const slug  = slugify(title);
    const token = manageToken();

    const { error } = await supabaseAdmin.from("events").insert({
      slug,
      title,
      description,
      category,
      location,
      event_time: when.toISOString(),
      host_name: hostName,
      host_contact_encrypted: encrypt(hostContact),
      manage_token: token,
      capacity,
      is_listed: Boolean(body.isListed),
    });

    if (error) throw error;

    return Response.json({ success: true, slug, manageToken: token });
  } catch (e) {
    console.error("[events/create]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't create your event. Please try again." }, { status: 500 });
  }
}
