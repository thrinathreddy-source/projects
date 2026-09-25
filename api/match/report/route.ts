import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 4_096);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("report", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    if (!supabaseAdmin) return Response.json({ error: "Server config error." }, { status: 500 });

    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
    if (!token) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const body = await req.json();
    const notifId = sanitise(body.notifId);
    const reason = sanitise(body.reason);
    if (!notifId) return Response.json({ error: "Missing report target." }, { status: 400 });

    // Only allow reporting a match that actually belongs to this user
    const { data: notif, error: notifErr } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, match_name, matched_user_id, type")
      .eq("id", notifId)
      .eq("user_id", user.id)
      .single();

    if (notifErr || !notif || notif.type !== "match" || !notif.matched_user_id) {
      return Response.json({ error: "This match couldn't be found." }, { status: 400 });
    }

    const reportedId = notif.matched_user_id;

    const { error: insertErr } = await supabaseAdmin.from("reports").insert({
      reporter_id: user.id,
      reported_id: reportedId,
      reported_name: notif.match_name || "Unknown",
      notification_id: notif.id,
      reason: reason || null,
    });
    if (insertErr) throw insertErr;

    // Two reports from two different people is a removal, not a coincidence —
    // count distinct reporters (not raw report rows) so one person can't
    // trigger a removal solo by filing multiple reports.
    const { data: priorReports } = await supabaseAdmin
      .from("reports")
      .select("reporter_id")
      .eq("reported_id", reportedId);

    const distinctReporters = new Set((priorReports || []).map((r) => r.reporter_id));

    if (distinctReporters.size >= 2) {
      await supabaseAdmin.from("profiles").update({ is_active: false }).eq("user_id", reportedId);
      await supabaseAdmin.from("reports").update({ status: "actioned" }).eq("reported_id", reportedId);
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("[report]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Failed to submit report. Please try again." }, { status: 500 });
  }
}
