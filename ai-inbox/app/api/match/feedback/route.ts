import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 512);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("feedback", ip, 20, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    // Verify session
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    if (!token || !supabaseAdmin) return Response.json({ ok: true });
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return Response.json({ ok: true });

    const { notifId, liked } = await req.json();
    if (typeof notifId !== "string" || typeof liked !== "boolean") return Response.json({ ok: true });

    // Store feedback — used to tune future matches
    await supabaseAdmin.from("feedback").insert({
      notification_id: notifId,
      liked,
      created_at: new Date().toISOString(),
    }).then(() => {}); // non-blocking

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: true }); // never fail the user on feedback
  }
}
