import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, safeCompare, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 2_048);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-cancel", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const slug  = sanitise(body.slug);
    const token = sanitise(body.token);
    if (!slug || !token) return Response.json({ error: "Missing slug or token." }, { status: 400 });
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
      .update({ is_cancelled: true })
      .eq("id", event.id);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (e) {
    console.error("[events/cancel]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't cancel your event." }, { status: 500 });
  }
}
