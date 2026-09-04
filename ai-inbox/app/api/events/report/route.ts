import crypto from "crypto";
import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 2_048);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("events-report", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const slug   = sanitise(body.slug);
    const reason = sanitise(body.reason);
    if (!slug) return Response.json({ error: "Missing event." }, { status: 400 });
    if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

    const { data: event, error: findErr } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq("slug", slug)
      .single();
    if (findErr || !event) return Response.json({ error: "Event not found." }, { status: 404 });

    const reporterHash = crypto.createHash("sha256").update(ip).digest("hex");

    const { error: insertErr } = await supabaseAdmin.from("event_reports").insert({
      event_id: event.id,
      reporter_hash: reporterHash,
      reason: reason || null,
    });
    // Unique(event_id, reporter_hash) means a repeat report from the same
    // IP just no-ops here rather than erroring the request.
    if (insertErr && insertErr.code !== "23505") throw insertErr;

    const { data: priorReports } = await supabaseAdmin
      .from("event_reports")
      .select("reporter_hash")
      .eq("event_id", event.id);

    const distinctReporters = new Set((priorReports || []).map((r) => r.reporter_hash));

    if (distinctReporters.size >= 2) {
      await supabaseAdmin.from("events").update({ is_published: false }).eq("id", event.id);
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("[events/report]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't submit report." }, { status: 500 });
  }
}
