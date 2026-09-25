// ═══════════════════════════════════════════════════════════════════════════
// MAYATARA MATCHING ENGINE — v2.0
//
// Research foundation:
//   • Gale-Shapley stable matching (Nobel 2012, Roth & Shapley)
//   • OKCupid geometric mean bidirectional scoring
//   • Eli Finkel — necessity (hard filter) vs sufficiency (soft score) model
//   • Helen Fisher — 4 neurotype compatibility matrix (14M+ user dataset)
//   • Gottman Institute — conflict style as strongest underused predictor
//   • Amir Levine — attachment style pairing research
//   • Malouff et al. meta-analysis — Big Five and relationship satisfaction
//   • Nature Human Behavior 2023 (8.5M people) — similarity dominates
//   • eHarmony's 6-cluster dimension framework
//   • Hinge "Most Compatible" — mutual revealed-preference architecture
//
// SCORING ARCHITECTURE (99 pts total per direction):
//   Tier 1 — Values Alignment         20 pts  (strongest long-term predictor)
//   Tier 2 — Attachment Style         15 pts
//   Tier 3 — Conflict Style           15 pts  (Gottman's most underused signal)
//   Tier 4 — Big Five Personality     20 pts
//   Tier 5 — Fisher Neurotype         12 pts
//   Tier 6 — Lifestyle Compatibility   9 pts  (3 location, 3 activity, 2 social, 1 language)
//   Tier 7 — Cognitive / Intellectual  8 pts
//
// FINAL SCORE = geometric mean of both-direction scores (OKCupid/Gale-Shapley)
//   = sqrt(scoreAforB × scoreBforA)
//   Forces mutuality: 100×0 = 0. 70×70 = 70.
//
// Hard filters run BEFORE scoring and eliminate pairs completely.
// ═══════════════════════════════════════════════════════════════════════════

import { ageInYears } from "./age";

export interface MatchProfile {
  id: string;
  user_id: string;
  looking_for: string;
  profile_json: Record<string, string>;
  contact_encrypted: string;
  contact_type: string;
  // Joined from users table
  name: string;
  gender: string | null;
  dob: string | null;
  city: string | null;
  religion: string | null;
  mother_tongue: string | null;
  profession: string | null;
  height: string | null;
}

// ── UTILITIES ────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

// A dealbreaker term appearing as a raw substring can't tell "kids" (the
// trait) apart from "no kids"/"don't want kids" (agreement with someone who
// doesn't have it) — a viewer whose dealbreaker is "kids" was hard-blocked
// against exactly the candidates who explicitly don't want kids either. This
// treats a negation cue immediately before the term as clearing that specific
// occurrence, while still catching the term anywhere else in the text.
const NEGATION_CUE = "no|not|don'?t|doesn'?t|never|without|isn'?t|won'?t|can'?t|hate|dislike|avoid";

function containsDealbreaker(haystack: string, term: string): boolean {
  if (!term || term.length <= 3) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:\\b(?:${NEGATION_CUE})\\s+\\w*\\s*)?\\b${escaped}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack))) {
    if (!m[0].match(new RegExp(`^(?:${NEGATION_CUE})`, "i"))) return true;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
  }
  return false;
}

const VALUE_KEYWORDS = [
  "family","kids","children","religion","spiritual","faith","money","savings",
  "invest","career","ambition","honest","trust","loyal","freedom","adventure",
  "travel","stability","independent","creative","curious","growth","books",
  "music","humor","deep","quiet","space","privacy","social","introvert",
  "extrovert","discipline","spontaneous","serious","playful","simple","complex",
];

// ── FISHER NEUROTYPE ─────────────────────────────────────────────────────────
// Derived from interview answers via keyword heuristic
// (Full FTI is 56 questions — this is the inference version for profile_json answers)
// Explorer = dopamine/novelty. Builder = serotonin/structure. Director = testosterone/logic. Negotiator = estrogen/empathy.

type Neurotype = "Explorer" | "Builder" | "Director" | "Negotiator" | null;

const EXPLORER_WORDS  = ["spontaneous","adventure","risk","new","explore","curious","novel","freedom","change","creative","experiment","impulse"];
const BUILDER_WORDS   = ["stable","routine","loyal","community","duty","tradition","careful","plan","structure","security","family","consistent"];
const DIRECTOR_WORDS  = ["logic","analysis","compete","direct","strategic","data","achieve","goal","debate","argue","efficient","decisive"];
const NEGOTIATOR_WORDS = ["empathy","feel","understand","connect","relationship","support","people","care","nuance","perspective","intuition","sensitive"];

function inferNeurotype(text: string): Neurotype {
  const t = norm(text);
  const scores = {
    Explorer:   EXPLORER_WORDS.filter(w => t.includes(w)).length,
    Builder:    BUILDER_WORDS.filter(w => t.includes(w)).length,
    Director:   DIRECTOR_WORDS.filter(w => t.includes(w)).length,
    Negotiator: NEGOTIATOR_WORDS.filter(w => t.includes(w)).length,
  };
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  return (Object.entries(scores).find(([, v]) => v === max)?.[0] as Neurotype) ?? null;
}

const NEUROTYPE_SCORE: Record<string, Record<string, number>> = {
  Explorer:   { Explorer: 12, Builder: 5, Director: 5, Negotiator: 7 },
  Builder:    { Explorer: 5, Builder: 10, Director: 4, Negotiator: 7 },
  Director:   { Explorer: 5, Builder: 4, Director: 3, Negotiator: 12 },
  Negotiator: { Explorer: 7, Builder: 7, Director: 12, Negotiator: 8 },
};

// ── ATTACHMENT STYLE ──────────────────────────────────────────────────────────
// Levine & Heller: Secure (~50%), Anxious (~20%), Avoidant (~25%)
// Inferred from interview answers (walkaway question, vulnerability, closeness)

type Attachment = "Secure" | "Anxious" | "Avoidant" | null;

const SECURE_WORDS   = ["comfortable","open","honest","direct","trust","secure","confident","communicate","talk","work through"];
const ANXIOUS_WORDS  = ["worry","scared","fear","abandon","reassure","need","close","always","never leave","clingy","text back","distance"];
const AVOIDANT_WORDS = ["space","independence","alone","overwhelm","smother","freedom","pull back","walls","guard","careful","slow","commitment"];

function inferAttachment(text: string): Attachment {
  const t = norm(text);
  const scores = {
    Secure:   SECURE_WORDS.filter(w => t.includes(w)).length,
    Anxious:  ANXIOUS_WORDS.filter(w => t.includes(w)).length,
    Avoidant: AVOIDANT_WORDS.filter(w => t.includes(w)).length,
  };
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  return (Object.entries(scores).find(([, v]) => v === max)?.[0] as Attachment) ?? null;
}

const ATTACHMENT_SCORE: Record<string, Record<string, number>> = {
  Secure:   { Secure: 15, Anxious: 10, Avoidant: 8 },
  Anxious:  { Secure: 10, Anxious: 4, Avoidant: 0 }, // Anxious+Avoidant = the trap
  Avoidant: { Secure: 8, Anxious: 0, Avoidant: 4 },
};

// ── CONFLICT STYLE ────────────────────────────────────────────────────────────
// Gottman: Validator, Volatile, Conflict-Avoider
// Inferred from "walkaway" and vulnerability questions

type ConflictStyle = "Validator" | "Volatile" | "Avoider" | null;

const VOLATILE_WORDS  = ["argue","debate","fight","confront","push back","call out","direct","blunt","speak up","won't let it go"];
const AVOIDER_WORDS   = ["avoid","let it go","not worth","choose battles","keep peace","quiet","move on","don't bring up","ignore"];
const VALIDATOR_WORDS = ["listen","understand","middle ground","both sides","calm","talk it out","compromise","perspective","patient","work it out"];

function inferConflictStyle(text: string): ConflictStyle {
  const t = norm(text);
  const scores = {
    Volatile:  VOLATILE_WORDS.filter(w => t.includes(w)).length,
    Avoider:   AVOIDER_WORDS.filter(w => t.includes(w)).length,
    Validator: VALIDATOR_WORDS.filter(w => t.includes(w)).length,
  };
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  return (Object.entries(scores).find(([, v]) => v === max)?.[0] as ConflictStyle) ?? null;
}

// Gottman: same style = best, Volatile+Avoider = worst
const CONFLICT_SCORE: Record<string, Record<string, number>> = {
  Validator: { Validator: 15, Volatile: 8, Avoider: 8 },
  Volatile:  { Validator: 8, Volatile: 12, Avoider: 3 },
  Avoider:   { Validator: 8, Volatile: 3, Avoider: 12 },
};

// ── BIG FIVE INFERENCE ────────────────────────────────────────────────────────
// Malouff meta-analysis: Neuroticism is the #1 negative predictor
// Score 1-5 per trait from answer text; similarity scoring except Neuroticism (absolute)

function scoreN(textA: string, textB: string): number {
  // Low N in both = best. High N = penalty.
  const NEURO = ["anxious","worry","stress","overthink","nervous","moody","sensitive","unstable","emotional","upset","fear","doubt"];
  const nA = NEURO.filter(w => textA.includes(w)).length;
  const nB = NEURO.filter(w => textB.includes(w)).length;
  const combined = nA + nB;
  if (combined === 0) return 7;  // both low N: maximum
  if (combined <= 2) return 4;
  if (combined <= 4) return 2;
  return 0;
}

function scoreC(textA: string, textB: string): number {
  // Conscientiousness similarity
  const CON = ["plan","disciplin","organiz","responsib","goal","commit","reliable","consistent","work hard","punctual","finish","follow through"];
  const cA = CON.filter(w => textA.includes(w)).length;
  const cB = CON.filter(w => textB.includes(w)).length;
  const diff = Math.abs(cA - cB);
  if (diff === 0) return 5;
  if (diff === 1) return 3;
  return 1;
}

function scoreA(textA: string, textB: string): number {
  // Agreeableness — both high is best
  const AGR = ["kind","empathy","warm","generous","cooperat","helpful","considerate","compassion","care","support","gentle","nice"];
  const aA = AGR.filter(w => textA.includes(w)).length;
  const aB = AGR.filter(w => textB.includes(w)).length;
  if (aA >= 2 && aB >= 2) return 4;
  if (aA >= 1 && aB >= 1) return 2;
  if (aA === 0 && aB === 0) return 0;
  return 1;
}

function scoreO(textA: string, textB: string): number {
  // Openness similarity
  const OPN = ["curious","explore","learn","read","art","music","culture","idea","creative","imagine","philosophy","travel","novel","open mind"];
  const oA = OPN.filter(w => textA.includes(w)).length;
  const oB = OPN.filter(w => textB.includes(w)).length;
  return Math.abs(oA - oB) <= 1 ? 2 : 0;
}

function scoreE(textA: string, textB: string): number {
  // Extraversion similarity
  const EXT = ["social","party","people","outgoing","talkative","crowd","event","meet","energy","lively","extrovert"];
  const eA = EXT.filter(w => textA.includes(w)).length;
  const eB = EXT.filter(w => textB.includes(w)).length;
  return Math.abs(eA - eB) <= 1 ? 2 : 0;
}

// ── MAIN SCORING FUNCTION ─────────────────────────────────────────────────────
// Returns { score, breakdown } — score is A's satisfaction with B (0-100)
// Run twice (A→B and B→A), then take geometric mean for final match score.

export interface ScoreBreakdown {
  values: number;
  attachment: number;
  conflict: number;
  personality: number;
  neurotype: number;
  lifestyle: number;
  cognitive: number;
  total: number;
  attachmentTypes: [Attachment, Attachment];
  conflictStyles: [ConflictStyle, ConflictStyle];
  neurotypes: [Neurotype, Neurotype];
}

function scoreOneDirection(viewer: MatchProfile, candidate: MatchProfile): number {
  const pjV = viewer.profile_json;    // viewer's prefs + answers
  const pjC = candidate.profile_json; // candidate's answers

  const viewerAnswers   = [pjV.q1, pjV.q2, pjV.q3, pjV.q4, pjV.q5].map(norm).join(" ");
  const candidateAnswers = [pjC.q1, pjC.q2, pjC.q3, pjC.q4, pjC.q5].map(norm).join(" ");
  const allViewerText   = viewerAnswers + " " + norm(pjV.pref_in_one_line);

  let score = 0;

  // ── TIER 1: VALUES ALIGNMENT (20 pts) ────────────────────────────────────

  // Children alignment (6 pts — Finkel necessity model)
  const wantsKidsV = norm(pjV.pref_in_one_line + " " + viewerAnswers);
  const wantsKidsC = candidateAnswers;
  const noKidsV = wantsKidsV.includes("no kids") || wantsKidsV.includes("don't want kids") || wantsKidsV.includes("childfree");
  const noKidsC = wantsKidsC.includes("no kids") || wantsKidsC.includes("don't want kids") || wantsKidsC.includes("childfree");
  const yesKidsV = wantsKidsV.includes("want kids") || wantsKidsV.includes("children") || wantsKidsV.includes("family");
  const yesKidsC = wantsKidsC.includes("want kids") || wantsKidsC.includes("children") || wantsKidsC.includes("family");
  if ((noKidsV && noKidsC) || (yesKidsV && yesKidsC)) score += 6;
  else if (noKidsV && yesKidsC) score += 0; // misaligned
  else score += 3; // unclear / no strong signal

  // Financial philosophy (4 pts)
  const saverWordsV = ["save","invest","frugal","careful","budget"].filter(w => allViewerText.includes(w)).length;
  const saverWordsC = ["save","invest","frugal","careful","budget"].filter(w => candidateAnswers.includes(w)).length;
  const spenderWordsV = ["spend","experience","live","yolo","treat","luxury","enjoy"].filter(w => allViewerText.includes(w)).length;
  const spenderWordsC = ["spend","experience","live","yolo","treat","luxury","enjoy"].filter(w => candidateAnswers.includes(w)).length;
  const finV = saverWordsV >= spenderWordsV ? "saver" : "spender";
  const finC = saverWordsC >= spenderWordsC ? "saver" : "spender";
  score += finV === finC ? 4 : 1;

  // Religion (4 pts)
  const relV = norm(viewer.religion || pjV.pref_religion || "");
  const relC = norm(candidate.religion || "");
  const relOpen = (s: string) => !s || s.includes("open") || s.includes("any") || s.includes("secular") || s.includes("none");
  if (relOpen(relV) && relOpen(relC)) score += 4;
  else if (relV && relC && relV === relC) score += 4;
  else if (relOpen(relV) || relOpen(relC)) score += 2;
  else score += 0;

  // Political/moral worldview (3 pts)
  const progV = ["equality","justice","progressive","liberal","rights","freedom"].filter(w => viewerAnswers.includes(w)).length;
  const progC = ["equality","justice","progressive","liberal","rights","freedom"].filter(w => candidateAnswers.includes(w)).length;
  const consV = ["traditional","values","culture","nation","family","conservative"].filter(w => viewerAnswers.includes(w)).length;
  const consC = ["traditional","values","culture","nation","family","conservative"].filter(w => candidateAnswers.includes(w)).length;
  // progV > 0 guard mirrors the cons branch: without it, a viewer with zero
  // keyword hits in either bucket (progV === consV === 0) tied "prog" via
  // >=, losing the neutral-side partial-credit match it should have gotten
  // against a genuinely conservative-leaning candidate.
  const politV = progV > 0 && progV >= consV ? "prog" : consV > 0 ? "cons" : "neutral";
  const politC = progC > 0 && progC >= consC ? "prog" : consC > 0 ? "cons" : "neutral";
  score += (politV === politC) ? 3 : (politV === "neutral" || politC === "neutral") ? 2 : 0;

  // Life pace / ambition alignment (3 pts)
  const ambV = ["career","ambition","build","achieve","grind","startup","work hard","hustle","goal"].filter(w => viewerAnswers.includes(w)).length;
  const ambC = ["career","ambition","build","achieve","grind","startup","work hard","hustle","goal"].filter(w => candidateAnswers.includes(w)).length;
  const lifeV = ["balance","family","slow","peace","travel","simple","present","rest"].filter(w => viewerAnswers.includes(w)).length;
  const lifeC = ["balance","family","slow","peace","travel","simple","present","rest"].filter(w => candidateAnswers.includes(w)).length;
  const paceV = ambV >= lifeV ? "ambitious" : "balanced";
  const paceC = ambC >= lifeC ? "ambitious" : "balanced";
  score += paceV === paceC ? 3 : 1;

  // ── TIER 2: ATTACHMENT STYLE (15 pts) ────────────────────────────────────
  const attV = inferAttachment(viewerAnswers);
  const attC = inferAttachment(candidateAnswers);
  if (attV && attC) {
    score += ATTACHMENT_SCORE[attV]?.[attC] ?? 7;
  } else {
    score += 7; // unknown = neutral
  }

  // ── TIER 3: CONFLICT STYLE (15 pts) ──────────────────────────────────────
  const conV = inferConflictStyle(viewerAnswers);
  const conC = inferConflictStyle(candidateAnswers);
  if (conV && conC) {
    score += CONFLICT_SCORE[conV]?.[conC] ?? 7;
  } else {
    score += 7;
  }

  // ── TIER 4: BIG FIVE PERSONALITY (20 pts) ────────────────────────────────
  score += scoreN(viewerAnswers, candidateAnswers); // Neuroticism: 0-7 pts
  score += scoreC(viewerAnswers, candidateAnswers); // Conscientiousness: 0-5 pts
  score += scoreA(viewerAnswers, candidateAnswers); // Agreeableness: 0-4 pts
  score += scoreO(viewerAnswers, candidateAnswers); // Openness: 0-2 pts
  score += scoreE(viewerAnswers, candidateAnswers); // Extraversion: 0-2 pts

  // ── TIER 5: FISHER NEUROTYPE (12 pts) ────────────────────────────────────
  const neurV = inferNeurotype(viewerAnswers);
  const neurC = inferNeurotype(candidateAnswers);
  if (neurV && neurC) {
    score += NEUROTYPE_SCORE[neurV]?.[neurC] ?? 6;
  } else {
    score += 6;
  }

  // ── TIER 6: LIFESTYLE COMPATIBILITY (9 pts) ───────────────────────────────

  // Location (3 pts)
  const locPref = norm(pjV.pref_location);
  const cityV = norm(viewer.city);
  const cityC = norm(candidate.city);
  const sameCity = cityV && cityC && cityV === cityC;
  if (locPref === "same city only") score += sameCity ? 3 : 0;
  else if (locPref === "anywhere in india" || locPref === "open to long distance" || !locPref) {
    score += sameCity ? 3 : 2;
  }

  // Physical activity alignment (3 pts)
  const activeV = ["gym","run","sport","hike","fit","active","workout","yoga","swim"].filter(w => viewerAnswers.includes(w)).length;
  const activeC = ["gym","run","sport","hike","fit","active","workout","yoga","swim"].filter(w => candidateAnswers.includes(w)).length;
  score += Math.abs(activeV - activeC) <= 1 ? 3 : 1;

  // Social pace (2 pts)
  const socialV = ["party","social","people","crowd","event","bar","meet"].filter(w => viewerAnswers.includes(w)).length;
  const socialC = ["party","social","people","crowd","event","bar","meet"].filter(w => candidateAnswers.includes(w)).length;
  score += Math.abs(socialV - socialC) <= 1 ? 2 : 0;

  // Mother tongue (1 pt)
  const mtV = norm(viewer.mother_tongue);
  const mtC = norm(candidate.mother_tongue);
  if (mtV && mtC && mtV === mtC) score += 1;

  // Preference dealbreaker — viewer's dealbreaker against candidate
  const dealV = norm(pjV.pref_dealbreaker);
  const candText = [candidate.profession, candidate.religion, candidate.city, candidateAnswers].map(norm).join(" ");
  // The >3 guard matches hardBlocked. A dealbreaker of "a" or "no" is a
  // substring of almost any answer, and without this it quietly took 30 points
  // off every candidate that person could ever be scored against.
  if (containsDealbreaker(candText, dealV)) score -= 30; // heavy penalty (not a hard block in one direction)

  // ── TIER 7: COGNITIVE / INTELLECTUAL (8 pts) ──────────────────────────────

  // Intellectual engagement similarity (3 pts)
  const intellV = ["read","book","learn","study","research","think","idea","philosophy","curious","knowledge"].filter(w => viewerAnswers.includes(w)).length;
  const intellC = ["read","book","learn","study","research","think","idea","philosophy","curious","knowledge"].filter(w => candidateAnswers.includes(w)).length;
  score += Math.abs(intellV - intellC) <= 1 ? 3 : 1;

  // Humor alignment (3 pts)
  const humorV = ["laugh","humor","funny","joke","sarcasm","wit","dark humor","silly","absurd"].filter(w => viewerAnswers.includes(w)).length;
  const humorC = ["laugh","humor","funny","joke","sarcasm","wit","dark humor","silly","absurd"].filter(w => candidateAnswers.includes(w)).length;
  score += humorV > 0 && humorC > 0 ? 3 : humorV === 0 && humorC === 0 ? 2 : 0;

  // "Describe the person" overlap with candidate's actual answers (2 pts)
  const descV = norm(pjV.pref_in_one_line);
  if (descV) {
    const descWords = descV.split(" ").filter(w => w.length > 4);
    const overlap = descWords.filter(w => candidateAnswers.includes(w)).length;
    score += overlap >= 2 ? 2 : overlap === 1 ? 1 : 0;
  }

  return Math.max(0, Math.min(100, score));
}

// ── HARD FILTERS ──────────────────────────────────────────────────────────────
// Finkel's necessity model — these eliminate before scoring
// Returns true if the pair should be EXCLUDED

function hardBlocked(a: MatchProfile, b: MatchProfile): boolean {
  const pjA = a.profile_json;
  const pjB = b.profile_json;

  // Gender preference (true binary filter per Finkel research)
  const prefGA = norm(pjA.pref_gender);
  const prefGB = norm(pjB.pref_gender);
  const gA = norm(a.gender);
  const gB = norm(b.gender);
  // Exact equality, never substring: "female".includes("male") is true, which
  // let anyone preferring Male be matched with a Female.
  // No `&& gB` / `&& gA` gate: that let an explicit preference go silently
  // unenforced whenever the other side's gender was missing on file — an
  // incomplete profile isn't "no preference", so it must not satisfy one.
  if (prefGA && prefGA !== "no preference" && gB !== prefGA) return true;
  if (prefGB && prefGB !== "no preference" && gA !== prefGB) return true;

  // Location: "same city only" is a hard requirement
  const locA = norm(pjA.pref_location);
  const locB = norm(pjB.pref_location);
  const cityA = norm(a.city);
  const cityB = norm(b.city);
  if (locA === "same city only" && cityA && cityB && cityA !== cityB) return true;
  if (locB === "same city only" && cityA && cityB && cityA !== cityB) return true;

  // Age range hard filter
  const ageA = ageInYears(a.dob);
  const ageB = ageInYears(b.dob);
  // A's age preference applies to B's age. A's own dob is irrelevant here —
  // gating on it meant a user with no dob had their age filters silently ignored.
  // An unknown ageB/ageA now fails an explicit preference rather than passing
  // it — a missing dob (legacy row predating the required-dob signup check)
  // isn't evidence the candidate is within range.
  if (pjA.pref_age_min && (ageB === null || ageB < +pjA.pref_age_min)) return true;
  if (pjA.pref_age_max && (ageB === null || ageB > +pjA.pref_age_max)) return true;
  if (pjB.pref_age_min && (ageA === null || ageA < +pjB.pref_age_min)) return true;
  if (pjB.pref_age_max && (ageA === null || ageA > +pjB.pref_age_max)) return true;

  // Dealbreaker — mutual hard block
  const dealA = norm(pjA.pref_dealbreaker);
  const dealB = norm(pjB.pref_dealbreaker);
  const bText = [b.profession, b.religion, b.city,
    pjB.q1, pjB.q2, pjB.q3, pjB.q4, pjB.q5].map(norm).join(" ");
  const aText = [a.profession, a.religion, a.city,
    pjA.q1, pjA.q2, pjA.q3, pjA.q4, pjA.q5].map(norm).join(" ");
  if (containsDealbreaker(bText, dealA)) return true;
  if (containsDealbreaker(aText, dealB)) return true;

  return false;
}

// ── BIDIRECTIONAL FINAL SCORE (Gale-Shapley / OKCupid geometric mean) ────────

export function matchScore(a: MatchProfile, b: MatchProfile): number {
  if (hardBlocked(a, b)) return -1;
  const sAB = scoreOneDirection(a, b); // A's satisfaction with B
  const sBA = scoreOneDirection(b, a); // B's satisfaction with A
  return Math.round(Math.sqrt(sAB * sBA)); // geometric mean — forces mutuality
}

// ── MATCH REASON GENERATOR ────────────────────────────────────────────────────
// Research-informed, specific, non-generic copy

export function buildMatchReason(a: MatchProfile, b: MatchProfile, category: string): string {
  const pjA = a.profile_json;
  const pjB = b.profile_json;
  const answersA = [pjA.q1, pjA.q2, pjA.q3, pjA.q4, pjA.q5].map(norm).join(" ");
  const answersB = [pjB.q1, pjB.q2, pjB.q3, pjB.q4, pjB.q5].map(norm).join(" ");

  const attA = inferAttachment(answersA);
  const attB = inferAttachment(answersB);
  const conA = inferConflictStyle(answersA);
  const conB = inferConflictStyle(answersB);
  const neurA = inferNeurotype(answersA);
  const neurB = inferNeurotype(answersB);
  const shared = VALUE_KEYWORDS.filter(k => answersA.includes(k) && answersB.includes(k));

  // Specific, research-grounded reasons in priority order
  if (attA === "Anxious" && attB === "Secure") return `${a.name} will feel safe to be fully present — ${b.name} shows up with the kind of steadiness that makes that possible.`;
  if (attA === "Secure" && attB === "Anxious") return `${b.name} will feel safe to be fully present — ${a.name} shows up with the kind of steadiness that makes that possible.`;
  if (attA === "Secure" && attB === "Secure") return "Two people who know how to be close without losing themselves — rare, and the research says it lasts.";
  if (neurA === "Director" && neurB === "Negotiator") return `${a.name} moves fast and decides. ${b.name} sees every side and keeps them grounded. The Director-Negotiator pairing has the strongest chemistry data behind it.`;
  if (neurA === "Negotiator" && neurB === "Director") return `${b.name} moves fast and decides. ${a.name} sees every side and keeps them grounded. The Director-Negotiator pairing has the strongest chemistry data behind it.`;
  if (neurA === "Explorer" && neurB === "Explorer") return "Both ran toward the same kind of aliveness in the last month. Explorers together don't stagnate — they push each other to the next thing.";
  if (conA === conB && conA === "Validator") return "They both want to understand before being understood. That's a conflict style match that Gottman's 40 years of research says is quiet gold.";
  if (conA === conB && conA === "Volatile") return "They'll argue — but they'll also clear the air. Two people who fight clean and forgive fast. Gottman says it can work beautifully.";
  if (shared.length >= 3) return `They both keep circling back to the same things: ${shared.slice(0, 3).join(", ")}. When two people's answers keep landing in the same place, it's not coincidence.`;
  if (shared.length >= 1) return `They both care about ${shared[0]} in a way that's not performative — it shows up in how they answer questions when they're not trying to impress anyone.`;

  const fallbacks: Record<string, string> = {
    "Dating":            "The way they describe what they actually want — not what sounds good, what they actually want — points to the same kind of connection.",
    "Friendship":        "They're both done with surface-level. What they described as a real friendship is the same thing.",
    "Co-founder":        "Their risk tolerance and work ethic are complementary. The kind of pair that moves fast and argues productively.",
    "Wedding":          "They want the same quiet life. Not the wedding — the Tuesday evenings after 10 years.",
    "Still Figuring Out":"They're asking the same honest questions. That's a better start than most people who think they already have the answers.",
  };
  return fallbacks[category] || "They're aligned where it actually counts — not on interests, on values.";
}

// ── GREEDY STABLE MATCHING ────────────────────────────────────────────────────
// Gale-Shapley inspired: score all pairs, sort descending, greedily assign.
// O(n²) — handles any realistic pool size.

// Minimum bidirectional score for a pair to be considered a match at all.
// Terms state: "If nobody in the current pool crosses the 75% threshold for
// you, you will receive a no-match notification." Without this, any pair that
// merely survived the hard filters was matched, however poorly they scored.
// Override with MIN_MATCH_SCORE while the pool is small.
export const MIN_MATCH_SCORE = Number(process.env.MIN_MATCH_SCORE ?? 75);

export function runMatching(pool: MatchProfile[]): Array<{ a: MatchProfile; b: MatchProfile; score: number }> {
  const pairs: Array<{ a: MatchProfile; b: MatchProfile; score: number }> = [];

  // Score all candidate pairs
  const scored: Array<{ a: MatchProfile; b: MatchProfile; score: number }> = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const s = matchScore(pool[i], pool[j]);
      // s === -1 means hard-blocked. Below the threshold means "no match" —
      // we would rather tell someone nobody fit than hand them a bad match.
      if (s >= MIN_MATCH_SCORE) scored.push({ a: pool[i], b: pool[j], score: s });
    }
  }

  // Sort by score descending (highest-quality matches first)
  scored.sort((x, y) => y.score - x.score);

  // Greedy assignment — ensures no pair where both would prefer each other (stability property)
  const matchedIds = new Set<string>();
  for (const pair of scored) {
    if (matchedIds.has(pair.a.user_id) || matchedIds.has(pair.b.user_id)) continue;
    pairs.push(pair);
    matchedIds.add(pair.a.user_id);
    matchedIds.add(pair.b.user_id);
  }

  return pairs;
}
