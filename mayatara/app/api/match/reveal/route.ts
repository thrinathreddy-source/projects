import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { rateLimit, getIP, rateLimitResponse, readJsonBody } from "@/lib/security";

// Returns the plaintext contact for ONE notification, and only to the person it
// belongs to. Contacts are stored encrypted in notifications.contact_revealed
// so a database dump never yields anyone's phone number in the clear — the key
// lives only in the server environment.
export async function POST(req: Request) {
  const bodyResult = await readJsonBody<{ notificationId?: unknown }>(req, 2_048);
  if (!bodyResult.ok) return bodyResult.error;
  const body = bodyResult.data;

  const rl = rateLimit("match-reveal", getIP(req), 30, 60 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return Response.json({ error: "Server config error." }, { status: 500 });

  // The caller's own access token. Using the anon key with this token means
  // every query runs under that user's RLS policies — the service-role key is
  // deliberately not used here, so ownership cannot be bypassed by a bad id.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    const { notificationId } = body;
    if (!notificationId || typeof notificationId !== "string") {
      return Response.json({ error: "Bad request." }, { status: 400 });
    }

    const db = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: user } = await db.auth.getUser();
    if (!user?.user) return Response.json({ error: "Not signed in." }, { status: 401 });

    // RLS ("notifications: own rows") means another user's id returns nothing.
    const { data: notif, error } = await db
      .from("notifications")
      .select("contact_revealed, contact_type")
      .eq("id", notificationId)
      .eq("type", "match")
      .maybeSingle();

    if (error || !notif?.contact_revealed) {
      return Response.json({ error: "Not found." }, { status: 404 });
    }

    let contact: string;
    try {
      contact = decrypt(notif.contact_revealed);
    } catch (e) {
      // decrypt() throws "Malformed ciphertext: expected iv:tag:data" only for
      // rows written before contacts were encrypted at rest (no colons in the
      // raw value) — that specific case is expected and falls back to the raw
      // value. Any other failure (wrong/rotated key, corrupted ciphertext,
      // auth-tag mismatch) must NOT fall back to returning the ciphertext
      // itself as if it were the contact — that hands the user garbage with a
      // 200 status and no indication anything went wrong.
      if (e instanceof Error && e.message.startsWith("Malformed ciphertext")) {
        contact = notif.contact_revealed;
      } else {
        console.error("[reveal] decrypt failed:", e instanceof Error ? e.message : e);
        return Response.json({ error: "Could not reveal contact. Please try again or contact support." }, { status: 500 });
      }
    }

    return Response.json({ contact, contact_type: notif.contact_type });
  } catch (e) {
    console.error("[reveal]", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Could not reveal contact." }, { status: 500 });
  }
}
