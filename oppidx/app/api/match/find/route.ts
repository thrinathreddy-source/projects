import { supabaseAdmin } from "@/lib/platform/supabase";
import { secureCompare } from "@/lib/secureCompare"
import { decrypt } from "@/lib/platform/encryption";
import { sendMatchEmail, sendNoMatchEmail, sendCronAlertEmail } from "@/lib/platform/email";
import { runMatching, buildMatchReason, type MatchProfile } from "@/lib/platform/matcher";
import { opportunitiesWithChasingCohorts, chasingCohortProfilePool } from "@/lib/chasingCohort";

// ─── FRIDAY NIGHT MATCHING JOB ───────────────────────────────────────────────
// Runs every Friday at 8pm IST (2:30pm UTC).
// vercel.json: { "crons": [{ "path": "/api/match/find", "schedule": "30 14 * * 5" }] }
// Protected by CRON_SECRET header.
//
// Two phases, in order:
//   1. Opportunity-cohort matching — people who saved/applied to the same
//      real opportunity (via the shared OppIDX/OppIDX Match identity, see
//      lib/chasingCohort.ts) get first crack at each other this Friday,
//      grouped by looking_for exactly like the main pool. The shared
//      pursuit is the real signal here, so it runs before the general pool.
//   2. The existing full-pool match, unchanged in behavior — its own DB
//      fetch naturally excludes anyone phase 1 already matched, since
//      phase 1 writes matched=true before phase 2 queries.
// ─────────────────────────────────────────────────────────────────────────────

/** Pairs off one pool via the real matcher and persists+notifies+emails
 * exactly like the original single-pool implementation did — shared by
 * both the cohort phase and the main pool phase so there's one true
 * implementation of "what happens when two people match," not two. */
async function matchPoolAndNotify(
  pool: MatchProfile[],
  buildReason: (a: MatchProfile, b: MatchProfile) => string
): Promise<{ matched: number; matchedUserIds: string[] }> {
  if (pool.length < 2 || !supabaseAdmin) return { matched: 0, matchedUserIds: [] }

  const pairs = runMatching(pool);
  const matchedUserIds: string[] = [];
  let matched = 0;

  for (const { a, b, score } of pairs) {
    if (matchedUserIds.includes(a.user_id) || matchedUserIds.includes(b.user_id)) continue;

    const { data: existing } = await supabaseAdmin
      .from("matches")
      .select("id")
      .or(`and(profile_a.eq.${a.id},profile_b.eq.${b.id}),and(profile_a.eq.${b.id},profile_b.eq.${a.id})`)
      .maybeSingle();
    if (existing) continue;

    const reason = buildReason(a, b);

    const { error: matchErr } = await supabaseAdmin.from("matches").insert({
      profile_a: a.id, profile_b: b.id, score, match_reason: reason,
    });
    if (matchErr) continue;

    await supabaseAdmin.from("profiles").update({ matched: true }).in("id", [a.id, b.id]);

    const contactA = decrypt(a.contact_encrypted);
    const contactB = decrypt(b.contact_encrypted);

    await Promise.all([
      supabaseAdmin.from("notifications").insert({
        user_id: a.user_id, type: "match",
        title: `Your Friday match — ${b.name}`,
        body: reason,
        contact_revealed: contactB,
        contact_type: b.contact_type,
        match_name: b.name,
        matched_user_id: b.user_id,
      }),
      supabaseAdmin.from("notifications").insert({
        user_id: b.user_id, type: "match",
        title: `Your Friday match — ${a.name}`,
        body: reason,
        contact_revealed: contactA,
        contact_type: a.contact_type,
        match_name: a.name,
        matched_user_id: a.user_id,
      }),
    ]);

    const { data: authA } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
    const { data: authB } = await supabaseAdmin.auth.admin.getUserById(b.user_id);

    await Promise.allSettled([
      authA?.user?.email && sendMatchEmail(authA.user.email, a.name, b.name, contactB, b.contact_type, reason),
      authB?.user?.email && sendMatchEmail(authB.user.email, b.name, a.name, contactA, a.contact_type, reason),
    ]);

    matchedUserIds.push(a.user_id, b.user_id);
    matched++;
  }

  return { matched, matchedUserIds };
}

/** Groups a pool by looking_for and runs matchPoolAndNotify per group —
 * the same partition-then-match structure both phases use. */
async function matchByCategory(
  pool: MatchProfile[],
  buildReason: (a: MatchProfile, b: MatchProfile, category: string) => string
): Promise<number> {
  const groups: Record<string, MatchProfile[]> = {};
  for (const p of pool) {
    if (!groups[p.looking_for]) groups[p.looking_for] = [];
    groups[p.looking_for].push(p);
  }

  let total = 0;
  for (const [category, groupPool] of Object.entries(groups)) {
    const { matched } = await matchPoolAndNotify(groupPool, (a, b) => buildReason(a, b, category));
    total += matched;
  }
  return total;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not set up yet." }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (!secureCompare(auth ?? "", `Bearer ${secret}`)) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
  let cohortMatched = 0;
  let totalUnmatched = 0;

  try {

  // ── Phase 1: opportunity-cohort matching ──────────────────────────────
  const cohorts = await opportunitiesWithChasingCohorts();
  for (const cohort of cohorts) {
    const pool = await chasingCohortProfilePool(cohort.userIds);
    if (pool.length < 2) continue;
    const matched = await matchByCategory(pool, (a, b, category) =>
      `You're both chasing ${cohort.title}. ${buildMatchReason(a, b, category)}`
    );
    cohortMatched += matched;
  }
  totalMatched += cohortMatched;

  // ── Phase 2: the existing full-pool match ──────────────────────────────
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
    await sendCronAlertEmail(error.message, totalMatched, 0).catch(console.error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length < 2) {
    await sendCronAlertEmail("", totalMatched, 0).catch(console.error);
    return Response.json({ matched: totalMatched, cohort_matched: cohortMatched });
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

  const poolMatched = await matchByCategory(profiles, buildMatchReason);
  totalMatched += poolMatched;

  // Notify everyone still unmatched — re-queried from the DB rather than
  // tracked in memory, since matchByCategory's per-group matching already
  // wrote matched=true for anyone paired off above.
  const { data: stillUnmatched } = await supabaseAdmin
    .from("profiles")
    .select("id, user_id, users!inner(name)")
    .in("id", profiles.map(p => p.id))
    .eq("matched", false);

  totalUnmatched = stillUnmatched?.length ?? 0;
  for (const p of stillUnmatched ?? []) {
    const userId = p.user_id as string;
    const userRow = Array.isArray(p.users) ? p.users[0] : p.users;
    const name = (userRow as { name: string } | undefined)?.name ?? "";

    await supabaseAdmin.from("notifications").insert({
      user_id: userId, type: "no_match",
      title: "No match this Friday — we're still looking.",
      body: "Nobody in the current pool was the right fit this week. We run again next Friday.",
    });

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUser?.user?.email) {
      await sendNoMatchEmail(authUser.user.email, name).catch(console.error);
    }
  }

  // Success alert to admin
  await sendCronAlertEmail("", totalMatched, totalUnmatched).catch(console.error);

  return Response.json({ matched: totalMatched, cohort_matched: cohortMatched, no_match_notified: totalUnmatched });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron] fatal:", msg);
    await sendCronAlertEmail(msg, totalMatched, totalUnmatched).catch(console.error);
    return Response.json({ error: "Cron failed.", detail: msg }, { status: 500 });
  }
}
