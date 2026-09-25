import { supabaseAdmin } from "@/lib/platform/supabase";
import { encrypt } from "@/lib/platform/encryption";
import { rateLimit, getIP, rateLimitResponse, sanitise, isValidEmail, isStrongPassword, checkSize } from "@/lib/platform/security";
import { checkContentSafety } from "@/lib/platform/moderation";
import { linkSubscriberToAuthUser } from "@/lib/subscriberAuth";

const ALLOWED_TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];

export async function POST(req: Request) {
  // ── Size guard ──────────────────────────────────────────────────────────────
  const sizeErr = checkSize(req, 16_384);
  if (sizeErr) return sizeErr;

  // ── India-only registration ─────────────────────────────────────────────────
  // Vercel sets x-vercel-ip-country on all requests automatically.
  const country = req.headers.get("x-vercel-ip-country") || "IN"; // fallback IN for local dev
  if (country !== "IN") {
    return Response.json(
      { error: "OppIDX Match is currently open for registration in India only. You can still explore the app." },
      { status: 403 }
    );
  }

  // ── Rate limit: 5 registrations per IP per hour ─────────────────────────────
  const ip = getIP(req);
  const rl = rateLimit("register", ip, 5, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();

    // ── Sanitise every string input ─────────────────────────────────────────
    // Already authenticated via the shared login flow (see app/account/page.tsx
    // and lib/subscriberAuth.ts)? Then this is someone filling in a OppIDX Match
    // profile for an identity that already exists — skip account creation
    // entirely and use their existing auth uid. Absent for every request from
    // the traditional registration form, which never sends this header
    // — that path is completely unchanged below.
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.replace("Bearer ", "");
    let existingUserId: string | null = null;
    let existingUserEmail: string | null = null;
    if (bearerToken) {
      if (!supabaseAdmin) return Response.json({ error: "Server error." }, { status: 500 });
      const { data: { user: existingUser }, error: tokenErr } = await supabaseAdmin.auth.getUser(bearerToken);
      if (tokenErr || !existingUser) return Response.json({ error: "Invalid session." }, { status: 401 });
      existingUserId = existingUser.id;
      existingUserEmail = existingUser.email?.toLowerCase() ?? null;
    }

    const name         = sanitise(body.name);
    const email        = existingUserEmail ?? sanitise(body.email).toLowerCase();
    const password     = typeof body.password === "string" ? body.password.slice(0, 128) : "";
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

    // ── Validate required fields ────────────────────────────────────────────
    // Password is only required when creating a brand-new account — a
    // shared-login user filling this in already has one.
    if (!name || !email || (!existingUserId && !password) || !lookingFor) {
      return Response.json({ error: "Name, email, password and what you're looking for are required." }, { status: 400 });
    }
    if (name.length < 2 || name.length > 100) {
      return Response.json({ error: "Name must be 2–100 characters." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return Response.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (!existingUserId) {
      const pwCheck = isStrongPassword(password);
      if (!pwCheck.ok) {
        return Response.json({ error: pwCheck.reason }, { status: 400 });
      }
    }
    if (!ALLOWED_TYPES.includes(lookingFor)) {
      return Response.json({ error: "Invalid relationship type." }, { status: 400 });
    }

    // ── Screen for violent / sexually explicit content ──────────────────────
    const modCheck = await checkContentSafety([name, quirky_fact]);
    if (modCheck.flagged) {
      return Response.json({ error: "Your submission couldn't be processed — please keep your profile respectful and free of explicit or violent content." }, { status: 400 });
    }

    // ── Age check server-side ───────────────────────────────────────────────
    if (dob) {
      const age = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (isNaN(age) || age < 18) {
        return Response.json({ error: "You must be 18 or older to use OppIDX Match." }, { status: 400 });
      }
      if (age > 120) {
        return Response.json({ error: "Invalid date of birth." }, { status: 400 });
      }
    }

    if (!supabaseAdmin) {
      return Response.json({ error: "Server error." }, { status: 500 });
    }

    // ── Create auth user (skipped when already authenticated via shared login) ──
    let userId: string;
    if (existingUserId) {
      userId = existingUserId;
    } else {
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
      userId = authData.user.id;
    }

    // ── Store user record ────────────────────────────────────────────────────
    // Two independent failure modes to handle, either of which can occur on
    // either the full or minimal shape below: (a) PostgREST's schema cache
    // not yet recognising a demographic column (pre-existing condition of
    // this project, unrelated to auth — the original "minimal insert"
    // fallback already existed for this), and (b) a row already existing
    // for this id — only possible for a shared-login user re-submitting
    // this form, since a brand-new admin.createUser() above always yields a
    // fresh id. On (b), update instead of erroring rather than treating a
    // double-submit as a hard failure.
    const fullRow = {
      id: userId, name, looking_for: lookingFor,
      dob: dob || null, gender: gender || null, height: height || null,
      city: city || null, religion: religion || null, profession: profession || null,
      mother_tongue: mother_tongue || null, institution: institution || null,
      quirky_fact: quirky_fact || null,
      phone_encrypted: encrypt(""),
    };
    const minimalRow = { id: userId, name, looking_for: lookingFor, phone_encrypted: encrypt("") };

    async function storeUserRecord(): Promise<{ ok: boolean }> {
      const { error: fullErr } = await supabaseAdmin!.from("users").insert(fullRow);
      if (!fullErr) return { ok: true };

      if (existingUserId && fullErr.code === "23505") {
        const { id: _omit, ...fullUpdate } = fullRow;
        const { error } = await supabaseAdmin!.from("users").update(fullUpdate).eq("id", userId);
        return { ok: !error };
      }

      // Full insert failed for some other reason (e.g. schema-cache miss on
      // a demographic column) — fall back to the minimal shape.
      const { error: minimalErr } = await supabaseAdmin!.from("users").insert(minimalRow);
      if (!minimalErr) return { ok: true };

      if (existingUserId && minimalErr.code === "23505") {
        const { id: _omit, ...minimalUpdate } = minimalRow;
        const { error } = await supabaseAdmin!.from("users").update(minimalUpdate).eq("id", userId);
        return { ok: !error };
      }

      return { ok: false };
    }

    const { ok } = await storeUserRecord();
    if (!ok) {
      // Users row failed — clean up the auth user so state stays consistent,
      // but only if we created it in this request. A pre-existing
      // shared-login identity must never be deleted here.
      if (!existingUserId) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(console.error);
      }
      throw new Error("Failed to create user record.");
    }

    // Bridge this identity into OppIDX's own Subscriber row (idempotent
    // upsert) — without this, someone who only ever registers through this
    // route gets a Supabase auth user + a `users` demographic row but no
    // Subscriber, so saves/pushes/chasing-cohort membership can never link
    // to them. The oppidx-side /api/account/register already does this;
    // this route was the one gap.
    await linkSubscriberToAuthUser(userId, email);

    return Response.json({ success: true, userId });
  } catch (e) {
    console.error("[register]", e instanceof Error ? e.message : "unknown");
    // Never leak internal error details
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
