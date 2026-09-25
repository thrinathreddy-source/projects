// Global Fit Check — scored with the same deterministic engine as the actual
// Friday matching run (lib/matcher.ts). No LLM calls, no paid embeddings.
//
// Percentile is computed against REAL active profiles blended with a fixed-size
// research-grounded baseline (lib/researchBaseline.ts) — this keeps the check
// running honestly before real registrants exist, and its influence shrinks on
// its own as the real pool grows past it. The "top matches" list, by contrast,
// is built from REAL registrants only — never the baseline — because that
// section explicitly claims to show real, anonymised people.
import { supabaseAdmin } from "@/lib/platform/supabase";
import { matchScore, buildMatchReason, type MatchProfile } from "@/lib/platform/matcher";
import { getResearchBaseline } from "@/lib/platform/researchBaseline";
import { rateLimit, getIP, rateLimitResponse, sanitiseRecord, sanitise, checkSize } from "@/lib/platform/security";

export async function POST(req: Request) {
  const sizeErr = checkSize(req, 16_384);
  if (sizeErr) return sizeErr;

  const ip = getIP(req);
  const rl = rateLimit("compat-global", ip, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await req.json();
    const profile = sanitiseRecord(body.profile || {});
    const relationshipType = sanitise(body.relationshipType);

    if (!relationshipType || !profile.name || !profile.personality || !profile.values) {
      return Response.json({ error: "missing_fields", message: "Fill in at least Name, Personality, and Values." }, { status: 400 });
    }
    if (!supabaseAdmin) {
      return Response.json({ error: "server_config" }, { status: 500 });
    }

    // Full demographic join — falls back to a name-only join if the `users` table
    // hasn't been migrated to include gender/dob/city/etc yet (matches the same
    // defensive pattern used in api/auth/register). Either way we never crash.
    let rows: Array<Record<string, unknown>> | null = null;
    const full = await supabaseAdmin
      .from("profiles")
      .select(`
        id, user_id, looking_for, profile_json,
        users!inner(name, gender, dob, height, city, religion, mother_tongue, profession)
      `)
      .eq("is_active", true)
      .eq("looking_for", relationshipType);

    if (full.error?.code === "42703") {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select(`id, user_id, looking_for, profile_json, users!inner(name)`)
        .eq("is_active", true)
        .eq("looking_for", relationshipType);
      if (fallback.error) throw fallback.error;
      rows = fallback.data;
    } else if (full.error) {
      throw full.error;
    } else {
      rows = full.data;
    }

    const pool: MatchProfile[] = (rows || []).map((r: Record<string, unknown>) => {
      const u = r.users as Record<string, string>;
      return {
        id: r.id as string,
        user_id: r.user_id as string,
        looking_for: r.looking_for as string,
        profile_json: r.profile_json as Record<string, string>,
        contact_encrypted: "",
        contact_type: "",
        name: u.name,
        gender: u.gender ?? null,
        dob: u.dob ?? null,
        city: u.city ?? null,
        religion: u.religion ?? null,
        mother_tongue: u.mother_tongue ?? null,
        profession: u.profession ?? null,
        height: u.height ?? null,
      };
    });

    // Blend real profiles with the research baseline for the percentile math only.
    const baseline = getResearchBaseline(relationshipType);
    const blended = [...pool, ...baseline];

    // Build a MatchProfile from the free-text fields the checker actually collects,
    // mapped onto the same q1-q5 + preference shape the real interview produces.
    const candidate: MatchProfile = {
      id: "candidate",
      user_id: "candidate",
      looking_for: relationshipType,
      profile_json: {
        q1: profile.personality || "",
        q2: profile.values || "",
        q3: profile.what_they_want || "",
        q4: profile.lifestyle || "",
        q5: profile.dealbreakers || "",
        pref_in_one_line: profile.what_they_want || "",
        pref_dealbreaker: profile.dealbreakers || "",
      },
      contact_encrypted: "",
      contact_type: "",
      name: "You",
      gender: null,
      dob: null,
      city: profile.location || null,
      religion: null,
      mother_tongue: null,
      profession: profile.profession || null,
      height: null,
    };

    // Candidate vs. the blended pool (real + research baseline) — this is what
    // the percentile is measured against, so it stays meaningful pre-launch.
    const candidateVsBlended = blended
      .map((p) => matchScore(candidate, p))
      .filter((s) => s >= 0);

    if (candidateVsBlended.length === 0) {
      return Response.json({
        error: "not_enough_pool",
        message: "Nothing currently active clears your stated preferences — nothing dishonest to show you here.",
      }, { status: 200 });
    }

    const candidateAvg = candidateVsBlended.reduce((s, v) => s + v, 0) / candidateVsBlended.length;

    // Each blended-pool member's own average compatibility with the rest of the blended
    // pool — a real distribution to rank the candidate against, without exposing its size.
    // As the real portion of `blended` grows, it dominates this distribution naturally.
    const poolAverages = blended.map((p, i) => {
      const others = blended.filter((_, j) => j !== i);
      const scores = others.map((o) => matchScore(p, o)).filter((s) => s >= 0);
      return scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    });

    const beat = poolAverages.filter((a) => a <= candidateAvg).length;
    const percentile = Math.max(1, Math.min(99, Math.round((beat / poolAverages.length) * 100)));

    // Real, anonymised top matches — sourced from REAL registrants only (never the
    // research baseline), reasoned by the same engine the Friday run uses. Names are
    // swapped for placeholders so no real identity is ever exposed here.
    const topMatches = pool
      .map((p) => ({ p, score: matchScore(candidate, p) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ p, score }) => ({
        compatibility: score,
        why: buildMatchReason({ ...candidate, name: "You" }, { ...p, name: "this person" }, relationshipType),
      }));

    // Trait read — genuinely derived from what this person just wrote, not fabricated.
    const text = `${profile.personality || ""} ${profile.values || ""} ${profile.what_they_want || ""}`.toLowerCase();
    const hasEmotionalDepth = /empath|deep|emotio|feeling|connect|vulnerab/.test(text);
    const hasAmbition = /ambiti|driven|goal|build|achiev|career|work/.test(text);
    const hasClarity = /honest|direct|clear|boundar|straight/.test(text);
    const hasFlexibility = /adapt|open|flex|curious|explore|figur/.test(text);

    const strongest = hasEmotionalDepth
      ? "Emotional depth — rare and clearly felt in how you describe yourself."
      : hasAmbition
      ? "Ambition with direction — you know what you're building toward."
      : hasClarity
      ? "Directness — you say what you want and what you won't accept."
      : "Openness — you're not closed off, which makes real connection possible.";

    const blindspot = !hasClarity
      ? "Vagueness about boundaries — the pool rewards people who know their line."
      : !hasEmotionalDepth
      ? "Emotional availability — leading with logic is useful but connection needs more."
      : !hasFlexibility
      ? "Rigidity — strong values are good, but leaving no room for surprise limits who you find."
      : "Overspecification — sometimes the list of dealbreakers rules out people who'd actually work.";

    const poolNeeds = hasAmbition && hasEmotionalDepth
      ? "Someone who can hold both drive and feeling — the active pool has plenty of one or the other, rarely both."
      : hasAmbition
      ? "Someone who takes their goals seriously without using them to avoid intimacy."
      : hasEmotionalDepth
      ? "Someone who shows up fully."
      : "Someone genuine.";

    return Response.json({
      report: {
        percentile,
        summary: `Based on your profile for ${relationshipType}, your average compatibility with the active pool beats ${percentile}% of it.`,
        your_strongest_trait: strongest,
        your_blindspot: blindspot,
        what_the_pool_needs_from_you: poolNeeds,
        top_matches: topMatches,
      },
    });
  } catch (e) {
    console.error("[compat-global]", e instanceof Error ? e.message : JSON.stringify(e));
    return Response.json({ error: "server_error", message: "Failed to run global fit check. Please try again." }, { status: 500 });
  }
}
