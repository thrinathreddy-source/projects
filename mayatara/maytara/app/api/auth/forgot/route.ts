import { supabaseAdmin } from "@/lib/supabase";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimitShared, getIP, rateLimitResponse, sanitise, readJsonBody, isValidEmail, hashIdentifier } from "@/lib/security";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://www.themayatara.com";

// Always the same answer, whatever happened underneath. Confirming whether an
// address has an account is an enumeration oracle — on a dating product that
// leaks who is a member to anyone who can guess an email.
const GENERIC = { success: true } as const;

export async function POST(req: Request) {
  const bodyResult = await readJsonBody<{ email?: unknown }>(req, 4_096);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  // Tighter than the generic auth limit: this endpoint sends mail. Shared
  // counter, so the cap holds across instances instead of per cold start.
  // Raised from 5 to 15 for shared NAT — one office or hostel address may
  // legitimately carry several people's reset requests in the same hour.
  const ip = getIP(req);
  const rl = await rateLimitShared("forgot-password", ip, 15, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const email = sanitise(body.email).toLowerCase();
    if (!email || !isValidEmail(email)) return Response.json(GENERIC);

    // Also capped per target address (hashed, not stored raw) — the IP limit
    // alone doesn't stop someone rotating across IPs/VPN exits from flooding
    // one victim's inbox with reset emails. Response stays identical either
    // way so this adds no new enumeration signal.
    const emailRl = await rateLimitShared("forgot-password-email", hashIdentifier(email), 5, 60 * 60_000);
    if (!emailRl.ok) return Response.json(GENERIC);

    if (!supabaseAdmin) {
      console.error("[forgot] supabaseAdmin is null");
      return Response.json(GENERIC);
    }

    // generateLink returns a one-time recovery link without sending anything —
    // Supabase's own mailer stays out of it, so the branded Resend copy is the
    // only mail that goes out.
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${SITE}/reset-password` },
    });

    // No such user, or anything else: swallow it and answer identically.
    if (error || !data?.properties?.action_link) return Response.json(GENERIC);

    await sendPasswordResetEmail(email, data.properties.action_link).catch((e) =>
      console.error("[forgot] send failed:", e)
    );

    return Response.json(GENERIC);
  } catch (e) {
    console.error("[forgot]", e instanceof Error ? e.message : "unknown");
    return Response.json(GENERIC);
  }
}
