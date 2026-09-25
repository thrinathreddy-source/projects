// Research-grounded synthetic baseline — lets the Global Fit Check run before
// there's a real pool to compare against, without inventing a fake headcount.
//
// These are NOT people. They never appear in "top matches" (that list is built
// from real registrants only, in api/compatibility/global/route.ts) — this
// baseline exists solely to give the percentile math something real-world-shaped
// to measure against pre-launch, then fades out naturally as real registrants
// out-populate it (it's a fixed size; real data just keeps growing).
//
// Distributions, so this isn't just made up either:
//  - Attachment style: Hazan & Shaver (1987), the original adult-attachment study —
//    Secure 56%, Avoidant 24%, Anxious 20%. (Levine & Heller's popular ~50/25/20
//    is a rounded restatement of this same study.)
//  - Fisher neurotype: only "Explorer ~26%" is a figure Fisher has published and is
//    checkable; the Builder/Director/Negotiator split isn't — so those three just
//    share the remaining 74% evenly. Treat that part as a placeholder, not a citation.
//  - Conflict style (Gottman): Gottman's work is about which styles predict
//    relationship survival, not their population base rate — there's no published
//    "X% of people are Volatile" figure. Equal thirds here is a stated assumption,
//    not research.
import type { MatchProfile } from "./matcher";

const BASELINE_SIZE = 40;

const CITIES = ["Bangalore", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad"];
const TONGUES = ["Hindi", "Telugu", "Tamil", "Kannada", "Marathi", "Bengali", "Gujarati", "Malayalam"];
const PROFESSIONS = ["Engineer", "Designer", "Teacher", "Founder", "Analyst", "Doctor", "Writer", "Consultant"];

type Attachment = "Secure" | "Anxious" | "Avoidant";
type Conflict = "Validator" | "Volatile" | "Avoider";
type Neurotype = "Explorer" | "Builder" | "Director" | "Negotiator";

const ATTACHMENT_WEIGHTS: Record<Attachment, number> = { Secure: 56, Avoidant: 24, Anxious: 20 };
const CONFLICT_WEIGHTS: Record<Conflict, number> = { Validator: 34, Volatile: 33, Avoider: 33 };
const NEUROTYPE_WEIGHTS: Record<Neurotype, number> = { Explorer: 26, Builder: 25, Director: 24, Negotiator: 25 };

const ATTACHMENT_PHRASES: Record<Attachment, string[]> = {
  Secure:   ["I talk things through and trust things will work out.", "I'm comfortable being close, and comfortable with space too."],
  Anxious:  ["I worry when I don't hear back and need reassurance sometimes.", "I care a lot about staying close and hate distance."],
  Avoidant: ["I need my independence and space to feel okay.", "I'm careful about how fast things move — I guard my time alone."],
};
const CONFLICT_PHRASES: Record<Conflict, string[]> = {
  Validator: ["I try to listen and find middle ground before anything else.", "I stay calm and talk it out."],
  Volatile:  ["I speak up directly and argue it out in the moment.", "I don't let things go — I push back."],
  Avoider:   ["I mostly let small things go and pick my battles.", "I keep the peace and move on quickly."],
};
const NEUROTYPE_PHRASES: Record<Neurotype, string[]> = {
  Explorer:   ["I'm spontaneous and love trying new things.", "New experiences and a bit of risk keep me curious."],
  Builder:    ["I value routine, loyalty, and stability.", "Consistency and planning matter a lot to me."],
  Director:   ["I'm logical and direct, I like clear goals.", "I think in strategy and enjoy a good debate."],
  Negotiator: ["I lead with empathy and read people well.", "Understanding someone's perspective comes naturally to me."],
};

// mulberry32 — deterministic PRNG so the baseline is stable across requests
// (a real percentile shouldn't jitter between two checks a minute apart).
function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function weightedPick<T extends string>(rand: () => number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

const cache: Record<string, MatchProfile[]> = {};

export function getResearchBaseline(relationshipType: string): MatchProfile[] {
  if (cache[relationshipType]) return cache[relationshipType];

  const rand = mulberry32(seedFromString("mayatara-baseline-" + relationshipType));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const profiles: MatchProfile[] = [];

  for (let i = 0; i < BASELINE_SIZE; i++) {
    const attachment = weightedPick(rand, ATTACHMENT_WEIGHTS);
    const conflict = weightedPick(rand, CONFLICT_WEIGHTS);
    const neurotype = weightedPick(rand, NEUROTYPE_WEIGHTS);

    const age = 22 + Math.floor(rand() * 15);
    const dob = new Date(Date.now() - age * 365.25 * 24 * 3600_000).toISOString().slice(0, 10);

    profiles.push({
      id: `baseline-${relationshipType}-${i}`,
      user_id: `baseline-${relationshipType}-${i}`,
      looking_for: relationshipType,
      profile_json: {
        q1: pick(ATTACHMENT_PHRASES[attachment]),
        q2: pick(CONFLICT_PHRASES[conflict]),
        q3: pick(NEUROTYPE_PHRASES[neurotype]),
        q4: "I care about honesty and try to be direct about what I want.",
        q5: "Family and personal growth both matter to me, in different ways.",
      },
      contact_encrypted: "",
      contact_type: "",
      name: "Baseline", // never surfaced — see api/compatibility/global/route.ts
      gender: rand() < 0.5 ? "Male" : "Female",
      dob,
      city: pick(CITIES),
      religion: null,
      mother_tongue: pick(TONGUES),
      profession: pick(PROFESSIONS),
      height: null,
    });
  }

  cache[relationshipType] = profiles;
  return profiles;
}
