import { supabaseAdmin } from "@/lib/supabase";
import { encrypt } from "@/lib/encryption";
import { rateLimitShared, getIP, rateLimitResponse, sanitise, isValidEmail, isStrongPassword, readJsonBody } from "@/lib/security";
import { checkContentSafety } from "@/lib/moderation";
import { ageInYears } from "@/lib/age";

const ALLOWED_TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];


export async function POST(req: Request) {
  // ── Size-capped body read ──────────────────────────────────────────────────
  const bodyResult = await readJsonBody<Record<string, unknown>>(req, 16_384);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  // ── India-only registration ─────────────────────────────────────────────────
  // Vercel sets x-vercel-ip-country on all requests automatically.
  const country = req.headers.get("x-vercel-ip-country") || "IN"; // fallback IN for local dev
  if (country !== "IN") {
    return Response.json(
      { error: "The Mayatara is currently open for registration in India only. You can still explore the app." },
      { status: 403 }
    );
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  // Two tiers, both keyed on IP and both counted in Postgres so the limit holds
  // across lambda instances rather than resetting on every cold start.
  //
  // The numbers are set for shared NAT, which is the normal case here: a hostel
  // floor, a college wifi, or an office all present as one address, so the old
  // 5/hour would have started rejecting genuine signups at the sixth person on
  // the same network. The hourly tier absorbs that kind of burst; the daily
  // tier is what actually stops sustained account farming from one source.
  const ip = getIP(req);

  const burst = await rateLimitShared("register:hour", ip, 30, 60 * 60_000);
  if (!burst.ok) return rateLimitResponse(burst.retryAfter);

  const sustained = await rateLimitShared("register:day", ip, 100, 24 * 60 * 60_000);
  if (!sustained.ok) return rateLimitResponse(sustained.retryAfter);

  try {
    // ── Sanitise every string input ─────────────────────────────────────────
    const name         = sanitise(body.name);
    const email        = sanitise(body.email).toLowerCase();
    // Not truncated: a silently shortened password here would still be sent
    // in full by every later login attempt, permanently locking the user out.
    // isStrongPassword() below rejects anything over 128 chars outright instead.
    const password     = typeof body.password === "string" ? body.password : "";
    const lookingFor   = sanitise(body.lookingFor);
    const dob          = sanitise(body.dob);
    const gender       = sanitise(body.gender);
    const height       = sanitise(body.height);
    const city         = sanitise(body.city);
    const religion     = sanitise(body.religion);
    const profession   = sanitise(body.profession);
    const mother_tongue = sanitise(body.mother_tongue);
    const institution  = sanitise(body.institution);
    const quirky_fact  = sanitise(body.quirky_fact);

    // ── First-touch attribution ─────────────────────────────────────────────
    // Whatever the browser captured on the first page of the visit. Advisory
    // only — never trusted, never used for any decision, just recorded so we
    // can tell which channel produced accounts that go on to complete the
    // interview. Capped short because these end up in an index.
    const attr = (body.attribution ?? {}) as Record<string, unknown>;
    const attrField = (v: unknown) => sanitise(v).slice(0, 120) || null;

    // ── Validate required fields ────────────────────────────────────────────
    // dob is required here (not just client-side) — the age gate below is the
    // only thing standing between this being a dating app for adults and one
    // that anyone underage can sign up for by omitting a field.
    if (!name || !email || !password || !lookingFor || !dob) {
      return Response.json({ error: "Name, email, password, date of birth, and what you're looking for are required." }, { status: 400 });
    }
    if (name.length < 2 || name.length > 100) {
      return Response.json({ error: "Name must be 2–100 characters." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return Response.json({ error: "Invalid email address." }, { status: 400 });
    }
    const pwCheck = isStrongPassword(password);
    if (!pwCheck.ok) {
      return Response.json({ error: pwCheck.reason }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(lookingFor)) {
      return Response.json({ error: "Invalid relationship type." }, { status: 400 });
    }

    // ── Screen for violent / sexually explicit content ──────────────────────
    // Every free-text field a user controls, not just name/quirky_fact — the
    // rest were previously stored unchecked.
    const modCheck = await checkContentSafety([
      name, quirky_fact, profession, institution, city, religion, mother_tongue,
    ]);
    if (modCheck.flagged) {
      return Response.json({ error: "Your submission couldn't be processed — please keep your profile respectful and free of explicit or violent content." }, { status: 400 });
    }

    // ── Age check server-side ───────────────────────────────────────────────
    // Unconditional: dob is a required field above, so there is no longer an
    // "if no dob" path that used to skip age verification entirely.
    const age = ageInYears(dob);
    // An unparseable date used to fall through to the 18+ branch, which told
    // people they were too young when the real problem was the format.
    if (age === null || age > 120) {
      return Response.json({ error: "Invalid date of birth." }, { status: 400 });
    }
    if (age < 18) {
      return Response.json({ error: "You must be 18 or older to use The Mayatara." }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return Response.json({ error: "Server error." }, { status: 500 });
    }

    // ── Create auth user ────────────────────────────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      if (authError.message.toLowerCase().includes("already")) {
        return Response.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      throw authError;
    }

    const userId = authData.user.id;

    // ── Store user record ────────────────────────────────────────────────────
    const { error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        id: userId, name, looking_for: lookingFor,
        dob: dob || null, gender: gender || null, height: height || null,
        city: city || null, religion: religion || null, profession: profession || null,
        mother_tongue: mother_tongue || null, institution: institution || null,
        quirky_fact: quirky_fact || null,
        phone_encrypted: encrypt(""),
        signup_source:   attrField(attr.source),
        signup_medium:   attrField(attr.medium),
        signup_campaign: attrField(attr.campaign),
        signup_referrer: attrField(attr.referrer),
        signup_landing:  attrField(attr.landing),
      });

    if (userError) {
      // Fallback: minimal insert if new columns don't exist yet in schema
      const { error: fallbackError } = await supabaseAdmin.from("users").insert({
        id: userId, name, looking_for: lookingFor, phone_encrypted: encrypt(""),
      });
      if (fallbackError) {
        // Users row failed — clean up the auth user so state stays consistent
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(console.error);
        throw new Error("Failed to create user record.");
      }
    }

    return Response.json({ success: true, userId });
  } catch (e) {
    console.error("[register]", e instanceof Error ? e.message : "unknown");
    // Never leak internal error details
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
