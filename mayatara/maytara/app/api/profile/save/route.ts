import { supabaseAdmin } from "@/lib/supabase";
import { encrypt } from "@/lib/encryption";
// import { getEmbedding, profileToText } from "@/lib/embeddings"; // re-enable when funded
import { rateLimit, getIP, rateLimitResponse, sanitiseRecord, sanitise, readJsonBody } from "@/lib/security";
import { checkContentSafety } from "@/lib/moderation";

const ALLOWED_TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];

export async function POST(req: Request) {
  const bodyResult = await readJsonBody<Record<string, unknown>>(req, 32_768);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  const ip = getIP(req);
  const rl = rateLimit("profile-save", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    // Checked before it is used, not after: the non-null assertion below used
    // to run first, so a missing service-role key surfaced as a TypeError
    // caught by the handler and reported as "Failed to save profile."
    if (!supabaseAdmin) {
      return Response.json({ error: "Server config error." }, { status: 500 });
    }

    // Verify caller is the authenticated user
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const userId      = user.id; // always from session, never from body
    const lookingFor  = sanitise(body.lookingFor);
    const contact     = sanitise(body.contact);
    const contactType = sanitise(body.contactType);
    const profileJson = sanitiseRecord(body.profileJson as Record<string, unknown> || {});

    if (!userId || !lookingFor || !profileJson) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }
    // lib/matcher.ts groups candidates by exact looking_for equality — an
    // unvalidated value here would silently isolate this user into a group of
    // one that can never be matched, with no error explaining why.
    if (!ALLOWED_TYPES.includes(lookingFor)) {
      return Response.json({ error: "Invalid relationship type." }, { status: 400 });
    }

    // Redoing the interview sends no contact — it was collected at signup and
    // is already encrypted in this row. Requiring it again meant a redo either
    // failed outright or would have had to ask for a phone number a second
    // time; keep whatever is stored instead.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("contact_encrypted, contact_type, matched")
      .eq("user_id", userId)
      .maybeSingle();

    if (!contact && !existing?.contact_encrypted) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── Screen interview answers for violent / sexually explicit content ────
    const modCheck = await checkContentSafety(Object.values(profileJson));
    if (modCheck.flagged) {
      return Response.json({ error: "One of your answers couldn't be processed — please keep your answers respectful and free of explicit or violent content." }, { status: 400 });
    }

    // Upsert profile — embedding intentionally null (re-enable getEmbedding when funded)
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id: userId,
        looking_for: lookingFor,
        profile_json: profileJson,
        embedding: null,
        contact_encrypted: contact ? encrypt(contact) : existing!.contact_encrypted,
        contact_type: contactType || existing?.contact_type || "phone",
        is_active: true,
        // Preserve an existing match instead of unconditionally clearing it.
        // A user who redoes the interview while already matched (e.g. to fix
        // a typo) must not be silently pulled back into next Friday's pool
        // while their current match's contact reveal is still live — that
        // would put two live matches against the same person in one week.
        matched: existing?.matched ?? false,
      }, { onConflict: "user_id" });

    if (error) throw error;

    // No confirmation email. Outbound mail is reserved for password resets —
    // the interview completion screen already tells people where their result
    // appears and when.

    return Response.json({ success: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
