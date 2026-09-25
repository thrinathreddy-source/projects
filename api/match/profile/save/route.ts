import { supabaseAdmin } from "@/lib/platform/supabase";
import { encrypt } from "@/lib/platform/encryption";
// import { getEmbedding, profileToText } from "@/lib/platform/embeddings"; // re-enable when funded
import { rateLimit, getIP, rateLimitResponse, sanitiseRecord, sanitise, checkSize } from "@/lib/platform/security";
import { sendWelcomeEmail } from "@/lib/platform/email";
import { checkContentSafety } from "@/lib/platform/moderation";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 32_768);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("profile-save", ip, 10, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    // Verify caller is the authenticated user
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const { data: { user }, error: authErr } = await supabaseAdmin!.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const body = await req.json();
    const userId      = user.id; // always from session, never from body
    const lookingFor  = sanitise(body.lookingFor);
    const contact     = sanitise(body.contact);
    const contactType = sanitise(body.contactType);
    const profileJson = sanitiseRecord(body.profileJson || {});

    if (!userId || !lookingFor || !profileJson || !contact) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!supabaseAdmin) {
      return Response.json({ error: "Server config error." }, { status: 500 });
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
        contact_encrypted: encrypt(contact),
        contact_type: contactType || "phone",
        is_active: true,
        matched: false,
      }, { onConflict: "user_id" });

    if (error) throw error;

    // Send confirmation email now that they're actually in the pool
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("name, email:id")
      .eq("id", userId)
      .single();

    if (userData) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (email) {
        sendWelcomeEmail(email, userData.name, lookingFor).catch(console.error);
      }
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
