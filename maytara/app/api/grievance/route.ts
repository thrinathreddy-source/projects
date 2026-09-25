import { supabaseAdmin } from "@/lib/supabase";
import { sendGrievanceEmail } from "@/lib/email";
import { GRIEVANCE_CATEGORIES } from "@/lib/grievance";
import {
  rateLimitShared, getIP, rateLimitResponse, sanitise,
  readJsonBody, isValidEmail, hashIdentifier,
} from "@/lib/security";

export async function POST(req: Request) {
  const bodyResult = await readJsonBody<Record<string, unknown>>(req, 8_192);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  // Generous, because the cost of turning away a genuine safety report is far
  // worse than the cost of a few junk submissions landing in the inbox.
  const ip = getIP(req);
  const rl = await rateLimitShared("grievance", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const category = sanitise(body.category);
    const name     = sanitise(body.name).slice(0, 100);
    const email    = sanitise(body.email).toLowerCase().slice(0, 320);

    // Not run through sanitise(): that strips anything matching its XSS
    // pattern, which would quietly eat parts of a message describing a link
    // someone was sent. Nothing here is ever rendered as HTML — it is escaped
    // on the way into the email and parameterised on the way into Postgres —
    // so the raw text is both safe to keep and the only useful version of it.
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";

    if (!(GRIEVANCE_CATEGORIES as readonly string[]).includes(category)) {
      return Response.json({ error: "Pick what this is about." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return Response.json({ error: "We need a valid email address to reply to." }, { status: 400 });
    }
    if (message.length < 10) {
      return Response.json({ error: "Tell us a little more — at least a sentence." }, { status: 400 });
    }

    // Deliberately NOT run through checkContentSafety. That screen exists to
    // keep explicit or violent content out of profiles; applied here it would
    // reject exactly the reports that matter most, because describing what
    // someone did to you often means repeating it.

    // Optional session — if they happen to be signed in, attach the account so
    // a deletion request doesn't need them to prove who they are separately.
    let userId: string | null = null;
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && supabaseAdmin) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    let reference = "";
    let stored = false;

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("grievances")
        .insert({
          category, name: name || null, email, message,
          user_id: userId,
          ip_hash: hashIdentifier(ip),
        })
        .select("id")
        .single();

      if (error) {
        console.error("[grievance] insert failed:", error.message);
      } else {
        stored = true;
        reference = (data?.id as string ?? "").slice(0, 8).toUpperCase();
      }
    }

    if (!reference) reference = Date.now().toString(36).toUpperCase();

    // One retry: this is the only notification path for "Report abuse or a
    // safety concern" / "Grievance or complaint" (SIREN tier, 24h SLA) — a
    // single transient Resend failure previously dropped the notification
    // silently while still returning `ok: true` because the row was stored.
    let mailed = false;
    for (let attempt = 0; attempt < 2 && !mailed; attempt++) {
      try {
        await sendGrievanceEmail({ category, name, email, message, userId, reference });
        mailed = true;
      } catch (e) {
        console.error(`[grievance] email failed (attempt ${attempt + 1}/2):`, e instanceof Error ? e.message : e);
      }
    }

    // Only claim we received it if it actually landed somewhere. Telling
    // someone their safety report is filed when it evaporated is worse than
    // asking them to try again.
    if (!stored && !mailed) {
      return Response.json(
        { error: "We couldn't record that. Please try again in a moment." },
        { status: 503 }
      );
    }

    return Response.json({ ok: true, reference });
  } catch (e) {
    console.error("[grievance]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
