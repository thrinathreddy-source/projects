import crypto from "crypto";
import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";

/**
 * POST /api/pulse/live/comments/report — same auto-hide pattern as
 * event_reports: 2 distinct reporters hides the comment pending review,
 * rather than one person being able to take it down solo.
 */
export async function POST(req: Request) {
  const sizeErr = checkSize(req, 2_048);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("pulse-comment-report", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  try {
    const body = await req.json();
    const commentId = sanitise(body.commentId);
    if (!commentId) return Response.json({ error: "Missing comment." }, { status: 400 });

    const reporterHash = crypto.createHash("sha256").update(ip).digest("hex");

    const { error: insertErr } = await supabaseAdmin.from("pulse_comment_reports").insert({
      comment_id: commentId,
      reporter_hash: reporterHash,
    });
    // Unique(comment_id, reporter_hash) means a repeat report from the same
    // IP just no-ops here rather than erroring the request.
    if (insertErr && insertErr.code !== "23505") throw insertErr;

    const { data: priorReports } = await supabaseAdmin
      .from("pulse_comment_reports")
      .select("reporter_hash")
      .eq("comment_id", commentId);

    const distinctReporters = new Set((priorReports || []).map((r) => r.reporter_hash));

    if (distinctReporters.size >= 2) {
      await supabaseAdmin.from("pulse_comments").update({ hidden: true }).eq("id", commentId);
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("[pulse/comments/report]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't submit report." }, { status: 500 });
  }
}
