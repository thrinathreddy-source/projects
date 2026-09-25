import crypto from "crypto";
import { supabaseAdmin } from "@/lib/platform/supabase";
import { rateLimit, getIP, rateLimitResponse, sanitise, checkSize } from "@/lib/platform/security";
import { checkContentSafety } from "@/lib/platform/moderation";

/** GET /api/pulse/live/comments?headlineId=<uuid> — public, oldest first. */
export async function GET(req: Request) {
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  const headlineId = new URL(req.url).searchParams.get("headlineId");
  if (!headlineId) return Response.json({ error: "Missing headline." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("pulse_comments")
    .select("id, author_name, body, created_at")
    .eq("headline_id", headlineId)
    .eq("hidden", false)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return Response.json({ error: "Couldn't load comments." }, { status: 500 });

  return Response.json({ comments: data || [] });
}

/**
 * POST /api/pulse/live/comments — anonymous, no login required (see
 * discussion in the conversation that shipped this: open commenting was
 * the deliberate choice, with keyword-based content-safety + IP-hash-gated
 * reporting as the moderation backstop, given Pulse's explicit apolitical
 * branding).
 */
export async function POST(req: Request) {
  const sizeErr = checkSize(req, 4_096);
  if (sizeErr) return sizeErr;
  if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });

  const ip = getIP(req);
  const rl = rateLimit("pulse-comments", ip, 10, 10 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const headlineId = typeof body.headlineId === "string" ? body.headlineId : "";
    const authorName = sanitise(body.authorName).slice(0, 60);
    const commentBody = sanitise(body.body);

    if (!headlineId) return Response.json({ error: "Missing headline." }, { status: 400 });
    if (commentBody.length < 2) return Response.json({ error: "Say a bit more than that." }, { status: 400 });

    const safety = await checkContentSafety([authorName, commentBody]);
    if (safety.flagged) {
      return Response.json({ error: "That comment could not be posted. Try rewording it." }, { status: 400 });
    }

    const commenterHash = crypto.createHash("sha256").update(ip).digest("hex");

    const { data, error } = await supabaseAdmin
      .from("pulse_comments")
      .insert({
        headline_id: headlineId,
        author_name: authorName || null,
        body: commentBody,
        commenter_hash: commenterHash,
      })
      .select("id, author_name, body, created_at")
      .single();
    if (error) throw error;

    return Response.json({ comment: data });
  } catch (e) {
    console.error("[pulse/comments]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Couldn't post comment." }, { status: 500 });
  }
}
