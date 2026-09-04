import { supabaseAdmin } from "@/lib/supabase";
import { decrypt, encrypt } from "@/lib/encryption";
import { sendCronAlertEmail } from "@/lib/email";
import { runMatching, buildMatchReason, MIN_MATCH_SCORE, type MatchProfile } from "@/lib/matcher";

// ─── FRIDAY NIGHT MATCHING JOB ───────────────────────────────────────────────
// Runs every Friday at 8pm IST (2:30pm UTC).
// vercel.json: { "crons": [{ "path": "/api/match/find", "schedule": "30 14 * * 5" }] }
// Protected by CRON_SECRET. Vercel Cron invokes this with GET and sends the
// secret as `Authorization: Bearer $CRON_SECRET` — it cannot send custom
// headers — so both verbs and both header forms are accepted here.
// ─────────────────────────────────────────────────────────────────────────────

async function runMatchCron(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  const bearer   = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const custom   = req.headers.get("x-cron-secret") || "";
  const { timingSafeEqual } = await import("crypto");
  const match = (given: string) =>
    given.length === expected.length && expected.length > 0 &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  const ok = match(bearer) || match(custom);
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Friday-only guard (IST = UTC+5:30)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (nowIST.getUTCDay() !== 5) {
    return Response.json({ skipped: true, reason: "Not Friday IST." });
  }

  if (!supabaseAdmin) {
    await sendCronAlertEmail("Server config error — supabaseAdmin is null.", 0, 0).catch(() => {});
    return Response.json({ error: "Server config error." }, { status: 500 });
  }

  let totalMatched = 0;
  let totalUnmatched = 0;
  let decryptFailures = 0;
  let notifyFailures = 0;
  let flagFailures = 0;

  try {

  // Fetch all active unmatched profiles joined with user demographics
  const { data: rows, error } = await supabaseAdmin
    .from("profiles")
    .select(`
      id, user_id, looking_for, profile_json, contact_encrypted, contact_type,
      users!inner(name, gender, dob, height, city, religion, mother_tongue, profession)
    `)
    .eq("is_active", true)
    .eq("matched", false);

  if (error) {
    await sendCronAlertEmail(error.message, 0, 0).catch(console.error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length < 2) {
    await sendCronAlertEmail("", 0, 0).catch(console.error);
    return Response.json({ matched: 0 });
  }

  // Flatten joined user data onto profile
  const profiles: MatchProfile[] = rows.map((r: Record<string, unknown>) => {
    const u = r.users as Record<string, string>;
    return {
      id:                r.id as string,
      user_id:           r.user_id as string,
      looking_for:       r.looking_for as string,
      profile_json:      r.profile_json as Record<string, string>,
      contact_encrypted: r.contact_encrypted as string,
      contact_type:      r.contact_type as string,
      name:              u.name,
      gender:            u.gender,
      dob:               u.dob,
      city:              u.city,
      religion:          u.religion,
      mother_tongue:     u.mother_tongue,
      profession:        u.profession,
      height:            u.height,
    };
  });

  // Group by looking_for, run matching per category
  const groups: Record<string, MatchProfile[]> = {};
  for (const p of profiles) {
    if (!groups[p.looking_for]) groups[p.looking_for] = [];
    groups[p.looking_for].push(p);
  }

  const matchedUserIds = new Set<string>();

  for (const [category, pool] of Object.entries(groups)) {
    if (pool.length < 2) continue;

    const pairs = runMatching(pool);

    for (const { a, b, score } of pairs) {
      // Skip if already matched in another category (shouldn't happen but guard anyway)
      if (matchedUserIds.has(a.user_id) || matchedUserIds.has(b.user_id)) continue;

      // Idempotency check — don't re-match an existing pair
      const { data: existing } = await supabaseAdmin
        .from("matches")
        .select("id")
        .or(`and(profile_a.eq.${a.id},profile_b.eq.${b.id}),and(profile_a.eq.${b.id},profile_b.eq.${a.id})`)
        .maybeSingle();
      if (existing) continue;

      const reason = buildMatchReason(a, b, category);

      // Decrypt BEFORE anything is written. If a contact can't be decrypted,
      // abandon this pair while both people are still in the pool — never leave
      // someone flagged as matched with no way to see who.
      let contactA: string, contactB: string;
      try {
        contactA = decrypt(a.contact_encrypted);
        contactB = decrypt(b.contact_encrypted);
      } catch (e) {
        console.error(`[cron] decrypt failed for pair ${a.id}/${b.id}:`, e);
        decryptFailures++;
        continue;
      }

      const { error: matchErr, data: matchRow } = await supabaseAdmin.from("matches").insert({
        profile_a: a.id, profile_b: b.id, score, match_reason: reason,
      }).select("id").single();
      if (matchErr) {
        // Previously silent — a run where every insert failed (schema drift,
        // RLS misconfig, connection exhaustion) reported `matched: 0` with no
        // trace of why.
        console.error(`[cron] match insert failed for pair ${a.id}/${b.id}:`, matchErr.message);
        continue;
      }

      // Notifications first: they are what the user actually sees. Only once
      // both are written do we take the pair out of the pool.
      const [notifA, notifB] = await Promise.all([
        supabaseAdmin.from("notifications").insert({
          user_id: a.user_id, type: "match",
          title: `Your Friday match — ${b.name}`,
          body: reason,
          contact_revealed: encrypt(contactB),
          contact_type: b.contact_type,
          match_name: b.name,
          matched_user_id: b.user_id,
        }).select("id").single(),
        supabaseAdmin.from("notifications").insert({
          user_id: b.user_id, type: "match",
          title: `Your Friday match — ${a.name}`,
          body: reason,
          contact_revealed: encrypt(contactA),
          contact_type: a.contact_type,
          match_name: a.name,
          matched_user_id: a.user_id,
        }).select("id").single(),
      ]);
      if (notifA.error || notifB.error) {
        console.error(`[cron] notification insert failed for pair ${a.id}/${b.id}:`,
          notifA.error?.message, notifB.error?.message);
        notifyFailures++;
        // Roll back the match row and whichever notification DID succeed.
        // Left in place, the idempotency check above would find this row on
        // every future run and skip the pair forever — while a partial
        // success would leave one side with a live "Your Friday match"
        // notification (contact already revealed) pointing at a match the
        // other side never received.
        await supabaseAdmin.from("matches").delete().eq("id", matchRow.id);
        if (notifA.data) await supabaseAdmin.from("notifications").delete().eq("id", notifA.data.id);
        if (notifB.data) await supabaseAdmin.from("notifications").delete().eq("id", notifB.data.id);
        // Leave both in the pool so next Friday can retry rather than
        // stranding them on a match they can never see.
        continue;
      }

      const { error: flagErr } = await supabaseAdmin
        .from("profiles").update({ matched: true }).in("id", [a.id, b.id]);
      if (flagErr) {
        // They have their match; they are just still flagged as in-pool. Log
        // loudly — left unnoticed this would re-match them next week.
        console.error(`[cron] failed to flag matched for ${a.id}/${b.id}:`, flagErr.message);
        flagFailures++;
      }

      // No outbound notification by design. The match — including the revealed
      // contact — lives on the dashboard only, behind auth and RLS. People come
      // back on their own.

      matchedUserIds.add(a.user_id);
      matchedUserIds.add(b.user_id);
      totalMatched++;
    }
  }

  // Notify everyone still unmatched.
  // Vercel's Hobby plan fires crons within a flexible one-hour window and may
  // retry, so this run is not guaranteed to be the only one today. Skip anyone
  // who already has a no-match notice from the past 20 hours rather than
  // stacking duplicates on their dashboard.
  const dedupeSince = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const unmatched = profiles.filter(p => !matchedUserIds.has(p.user_id));
  for (const p of unmatched) {
    const { data: recent } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", p.user_id)
      .eq("type", "no_match")
      .gte("created_at", dedupeSince)
      .maybeSingle();
    if (recent) continue;

    const { error: nmErr } = await supabaseAdmin.from("notifications").insert({
      user_id: p.user_id, type: "no_match",
      title: "No match this Friday — we're still looking.",
      body: "Nobody in the current pool was the right fit this week. We run again next Friday.",
    });
    if (nmErr) {
      console.error(`[cron] no-match notification failed for ${p.user_id}:`, nmErr.message);
      notifyFailures++;
      continue;
    }
    totalUnmatched++;
  }

  // Success alert to admin
  await sendCronAlertEmail("", totalMatched, totalUnmatched).catch(console.error);

  return Response.json({
    matched: totalMatched,
    no_match_notified: totalUnmatched,
    min_score: MIN_MATCH_SCORE,
    failures: { decrypt: decryptFailures, notification: notifyFailures, flag: flagFailures },
  });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron] fatal:", msg);
    await sendCronAlertEmail(msg, totalMatched, totalUnmatched).catch(console.error);
    return Response.json({ error: "Cron failed.", detail: msg }, { status: 500 });
  }
}

// Vercel Cron calls GET; POST stays available for manual triggering.
export const GET  = runMatchCron;
export const POST = runMatchCron;
