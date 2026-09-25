import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, getIP, rateLimitResponse, readJsonBody } from "@/lib/security";

// Match ratings. This is the only quality signal the matcher ever gets back, so
// the response now says whether the row was actually stored — the old version
// returned { ok: true } for every path including "no token" and "insert
// failed", and the dashboard (which sent no token at all) told people their
// feedback had been received while nothing was written.
export async function POST(req: Request) {
  const bodyResult = await readJsonBody<{ notifId?: unknown; liked?: unknown }>(req, 512);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  const ip = getIP(req);
  const rl = rateLimit("feedback", ip, 20, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!supabaseAdmin) {
    return Response.json({ ok: false, stored: false, error: "Server config error." }, { status: 500 });
  }

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, stored: false }, { status: 401 });

    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return Response.json({ ok: false, stored: false }, { status: 401 });

    const { notifId, liked } = body;
    if (typeof notifId !== "string" || typeof liked !== "boolean") {
      return Response.json({ ok: false, stored: false }, { status: 400 });
    }

    // Rate a notification that is yours. Nothing here is sensitive, but without
    // the check any signed-in account could write feedback rows against another
    // person's match and skew whatever we tune on.
    const { data: notif } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("id", notifId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!notif) return Response.json({ ok: false, stored: false }, { status: 404 });

    const { error } = await supabaseAdmin.from("feedback").insert({
      notification_id: notifId,
      liked,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error("[feedback] insert failed:", error.message);
      return Response.json({ ok: false, stored: false }, { status: 500 });
    }

    return Response.json({ ok: true, stored: true });
  } catch (e) {
    console.error("[feedback]", e instanceof Error ? e.message : "unknown");
    return Response.json({ ok: false, stored: false }, { status: 500 });
  }
}
