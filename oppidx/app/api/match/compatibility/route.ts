// Pair compatibility — local scoring, no AI dependency, instant results.
import { rateLimit, getIP, rateLimitResponse, sanitiseRecord, sanitise, checkSize } from "@/lib/platform/security";

export async function POST(request: Request) {
  const sizeErr = checkSize(request, 16_384);
  if (sizeErr) return sizeErr;

  const ip = getIP(request);
  const rl = rateLimit("compat", ip, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  try {
    const body = await request.json();
    const personA        = sanitiseRecord(body.personA || {});
    const personB        = sanitiseRecord(body.personB || {});
    const relationshipType = sanitise(body.relationshipType);
    return Response.json({ report: scorePair(personA, personB, relationshipType) });
  } catch (e) {
    console.error("[compat]", e instanceof Error ? e.message : "err");
    return Response.json({ error: "Failed to generate report." }, { status: 500 });
  }
}

// ── Deterministic hash from full profile text ─────────────────────────────
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return Math.abs(h);
}

function profileHash(a: Record<string, string>, b: Record<string, string>): number {
  const combined = Object.values(a).join("|") + "||" + Object.values(b).join("|");
  return djb2(combined);
}

// ── Pick one item from an array deterministically using offset ────────────
function pick<T>(arr: T[], hash: number, offset = 0): T {
  return arr[(hash + offset) % arr.length];
}

// ── Keyword overlap scorer ────────────────────────────────────────────────
function kw(text: string) { return (text || "").toLowerCase(); }

function overlap(a: string, b: string, terms: string[]): number {
  const ka = kw(a); const kb = kw(b);
  const hits = terms.filter(t => ka.includes(t) && kb.includes(t)).length;
  return Math.min(1, hits / Math.max(1, terms.length * 0.35));
}

// pull a meaningful word from free text (first non-trivial word)
function extractWord(text: string, fallback: string): string {
  const stop = new Set(["i","a","an","the","and","or","but","is","are","was","were","be","to","of","in","on","at","for","with","my","me","we","you","it","this","that","have","has","do","did","not","so","as","by","from","about","what","who","when","how","very","just","only","also","more","most","some","any","all","they","their","them","can","will","would","could","should"]);
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
  return words[0] || fallback;
}

// ── Statement libraries ───────────────────────────────────────────────────

type T2 = (a: string, b: string) => string;

const STRENGTH_TEMPLATES: Record<string, T2[]> = {
  values: [
    (a, b) => `Both describe ${extractWord(a, "honesty")} and ${extractWord(b, "trust")} as non-negotiables — that shared foundation is genuinely rare.`,
    (_a, _b) => "Core values land in the same place — this is the thing that holds a connection together when everything else gets hard.",
    (a, _b) => `The way ${extractWord(a, "this person")} describes what they care about maps closely onto the other — that kind of alignment usually takes years to find.`,
    (_a, _b) => "Values alignment is the strongest dimension here — most pairs have this partially, not this clearly.",
    (a, b) => `${extractWord(a, "Depth")} and ${extractWord(b, "direction")} — both people have these, which is the rarest combination in the pool.`,
  ],
  personality: [
    (_a, _b) => "Personality complement is strong — not identical, which is the right kind of match. You'll bring out parts of each other that don't come out alone.",
    (a, _b) => `One person leads with ${extractWord(a, "intuition")}, the other grounds it — that tension is productive, not destructive.`,
    (_a, _b) => "The personality read here is complementary rather than mirrored — that tends to last longer.",
    (a, b) => `${extractWord(a, "Warmth")} meeting ${extractWord(b, "directness")} — those two things together make for real conversations.`,
    (_a, _b) => "How these two people describe themselves suggests they'd actually be interesting to each other, not just compatible.",
  ],
  lifestyle: [
    (_a, _b) => "Day-to-day life is compatible — the ordinary won't become a battlefield. That matters more than people admit.",
    (a, _b) => `Both seem to value ${extractWord(a, "balance")} in how they structure their time — that removes a lot of daily friction.`,
    (_a, _b) => "Lifestyle fit is underrated. The small recurring things — sleep, pace, how you spend a Sunday — these compound. This pair has reasonable overlap there.",
    (_a, _b) => "The rhythm of their lives isn't identical, but it's close enough that they wouldn't constantly be pulling in opposite directions.",
    (a, b) => `${extractWord(a, "One")} values ${extractWord(b, "space")} — and the other seems to give it naturally. That's compatibility in the real sense.`,
  ],
  goals: [
    (_a, _b) => "Long-term direction is pointing roughly the same way — not identical, but close enough that five years from now they wouldn't feel like strangers.",
    (a, _b) => `Both have a clear sense of where they're going — and ${extractWord(a, "that")} destination overlaps more than it doesn't.`,
    (_a, _b) => "The bigger picture aligns. That's not guaranteed and not small.",
    (_a, _b) => "Goals alignment is one of the quieter dimensions — it doesn't show up immediately but it's what either keeps two people together or slowly pulls them apart. This one is solid.",
    (a, b) => `What ${extractWord(a, "one")} is building toward and what ${extractWord(b, "the other")} wants — they're in the same general territory.`,
  ],
  communication: [
    (_a, _b) => "Communication styles are a reasonable fit — disagreements won't spiral because they can't hear each other.",
    (a, _b) => `${extractWord(a, "Direct")} meeting open — that combination works. Neither is going to have to guess what the other means.`,
    (_a, _b) => "The way these two people describe things suggests they'd actually understand each other in an argument, which is the hard part.",
    (_a, _b) => "Communication compatibility doesn't mean they'll never fight. It means they'll fight well — and come back from it.",
    (_a, _b) => "Both seem to value clarity over performance in how they communicate — that's a good sign.",
  ],
};

const WATCHPOINT_TEMPLATES: Record<string, T2[]> = {
  values: [
    (a, _b) => `Values diverge around ${extractWord(a, "some core things")} — these don't go away, they get louder. Surface them early.`,
    (_a, _b) => "There are places where what each person cares about doesn't obviously overlap — that's not a dealbreaker, but it needs naming before it becomes a pattern.",
    (_a, _b) => "Values misalignment is the slow one — it doesn't hurt immediately, it accumulates. Worth having the direct conversation early.",
    (a, b) => `What ${extractWord(a, "one")} considers non-negotiable, ${extractWord(b, "the other")} hasn't mentioned — that gap is worth exploring.`,
    (_a, _b) => "The foundation isn't as clear here as the other dimensions — spend time on this before anything else.",
  ],
  personality: [
    (_a, _b) => "Personality differences are real here — the question is whether they're the complementary kind or just friction. Only time reveals that, but worth paying attention to.",
    (a, _b) => `${extractWord(a, "One person's")} style might push against the other's grain — not impossible to navigate, but it takes active work.`,
    (_a, _b) => "How these two describe themselves suggests they might exhaust each other in certain situations — knowing that in advance is useful.",
    (_a, _b) => "Personality fit is the hardest dimension to change, so name the differences early rather than hoping they'll sort themselves out.",
    (a, b) => `${extractWord(a, "One")} is more ${extractWord(b, "intense")} — that works until it doesn't. Worth watching.`,
  ],
  communication: [
    (_a, _b) => "Different communication styles will need active work from both sides — not impossible, but it won't happen on its own.",
    (_a, _b) => "The way these two people describe things suggests they process differently — one might feel unheard, the other might feel overwhelmed. Name it.",
    (a, _b) => `${extractWord(a, "One person")} is more direct than the other — that asymmetry creates tension in difficult conversations if it's not acknowledged.`,
    (_a, _b) => "Communication is the one dimension you can improve with effort. But both people have to want to. Check that assumption.",
    (_a, _b) => "The communication styles here don't obviously fit — which doesn't mean incompatible, it means they'll need to build their own language for disagreement.",
  ],
  goals: [
    (_a, _b) => "Long-term direction doesn't obviously match — have that conversation early, not late.",
    (a, _b) => `Where ${extractWord(a, "one")} is headed and where the other wants to go aren't obviously the same place — worth mapping out explicitly.`,
    (_a, _b) => "Goals diverge in ways that matter over years, not weeks — this won't feel urgent now, but it will.",
    (_a, _b) => "The five-year picture isn't pointing the same direction — that's not a verdict, but it's a conversation that needs to happen.",
    (a, b) => `${extractWord(a, "One")} wants ${extractWord(b, "something")} the other hasn't mentioned — surface that gap before it surfaces itself.`,
  ],
  lifestyle: [
    (_a, _b) => "Lifestyle differences could create daily tension — small things compound faster than big ones.",
    (a, _b) => `The pace of ${extractWord(a, "daily life")} for these two people doesn't obviously match — the ordinary stuff is where most connections quietly break down.`,
    (_a, _b) => "Day-to-day life isn't as compatible here as the other dimensions — that's the thing that matters most after the novelty wears off.",
    (_a, _b) => "Lifestyle fit is the grind dimension — it's not romantic, but misalignment there creates more friction than almost anything else.",
    (a, b) => `${extractWord(a, "One")} values ${extractWord(b, "routine")} differently than the other — worth talking about before it becomes a recurring argument.`,
  ],
};

const VERDICT_VARIANTS: Record<string, string[]> = {
  strong: [
    "Strong fit — worth showing up for.",
    "This one has real potential.",
    "Strong signal — trust it.",
    "The ingredients are here. Do something with it.",
    "Worth exploring seriously.",
  ],
  solid: [
    "Solid ground with real work to do.",
    "Good foundation — not a free ride.",
    "More right than wrong. Put in the work.",
    "Real potential, real effort required.",
    "Promising — go in with eyes open.",
  ],
  honest: [
    "Real differences — go in honest.",
    "Possible, but not easy. Be clear with each other.",
    "The gaps are there — name them early.",
    "Could work, but not on autopilot.",
    "Worth a conversation — not a blind leap.",
  ],
  hard: [
    "Significant gaps — name them early.",
    "This one requires honesty about whether it's worth it.",
    "Hard fit — possible, but go in clear-eyed.",
    "The work here is real. Decide if you're both willing.",
    "Gaps exist. Whether they matter is up to you.",
  ],
};

const SUMMARY_OPENERS = [
  (type: string, overall: number) => `For ${type}, this pair scores ${overall}/100.`,
  (type: string, overall: number) => `${type} compatibility: ${overall}/100.`,
  (type: string, overall: number) => `Across the dimensions that matter for ${type}, this pair lands at ${overall}/100.`,
  (type: string, overall: number) => `The honest read for ${type}: ${overall}/100.`,
];

const SUMMARY_STRONG = [
  (dim: string) => `${dim} is the strongest dimension — lean into that.`,
  (dim: string) => `The clearest alignment is on ${dim} — that's the foundation to build from.`,
  (dim: string) => `${dim} is where this pair has the most to work with — start there.`,
  (dim: string) => `${dim} does the heavy lifting here — it's real and it's enough to go on.`,
];

const SUMMARY_WEAK = [
  (dim: string) => `The main friction is ${dim} — name it before anything else.`,
  (dim: string) => `${dim} is where the work is — don't avoid that conversation.`,
  (dim: string) => `${dim} is the watchpoint — everything else depends on getting that right first.`,
  (dim: string) => `The gap is in ${dim} — that's where to start, not end.`,
];

const SUMMARY_CLOSE = [
  "No score predicts the future, but this breakdown shows where the work is.",
  "Scores don't decide anything — they show where to look.",
  "Use the breakdown, not just the number.",
  "What happens next is entirely up to the people, not the algorithm.",
];

// ── Main scorer ───────────────────────────────────────────────────────────

function scorePair(a: Record<string, string>, b: Record<string, string>, type: string) {
  const hash = profileHash(a, b);

  const pTerms = ["introvert","extrovert","empath","logical","creative","analytical","spontan","humour","sarcas","serious","warm","direct","independent","sensitive","structured","flexible","intense","playful","reserved","expressive"];
  const vTerms = ["honest","loyalt","family","freedom","ambition","faith","career","travel","stability","growth","trust","respect","generos","compassion","justice","integrity","authentic","purpose","balance","community"];
  const lTerms = ["early","night","active","fitness","travel","homebody","social","quiet","work","cook","read","sport","meditat","routine","spontan","minimalist","adventure","hygge","slow","fast"];
  const gTerms = ["kids","child","settl","build","startup","corporate","abroad","marriage","partner","retire","create","lead","teach","heal","explore","legacy","impact","freedom","security","purpose"];

  const pa = `${a.personality||""} ${a.values||""} ${a.lifestyle||""} ${a.what_they_want||""}`;
  const pb = `${b.personality||""} ${b.values||""} ${b.lifestyle||""} ${b.what_they_want||""}`;

  // text-length signal: longer = more self-aware (slight boost)
  const depthA = Math.min(1, pa.length / 400);
  const depthB = Math.min(1, pb.length / 400);
  const depthBoost = ((depthA + depthB) / 2) * 5;

  // word-count difference signal: very different lengths = might process differently
  const lenDiff = Math.abs(pa.split(" ").length - pb.split(" ").length);
  const csDeduct = Math.min(8, lenDiff * 0.3);

  // hash-derived jitter: 0–14, unique per text content
  const jitter = (hash % 15);

  const pm = Math.round(Math.min(96, 53 + overlap(pa, pb, pTerms) * 37 + depthBoost + (jitter % 7)));
  const vaScore = Math.round(Math.min(96, 48 + overlap(kw(a.values||""), kw(b.values||""), vTerms) * 42 + depthBoost + ((jitter + 3) % 8)));
  const lc = Math.round(Math.min(96, 48 + overlap(pa, pb, lTerms) * 40 + ((jitter + 5) % 9)));
  const ga = Math.round(Math.min(96, 46 + overlap(pa, pb, gTerms) * 42 + ((jitter + 2) % 8)));
  const cs = Math.round(Math.min(96, 58 + overlap(pa, pb, ["direct","open","honest","communicat","listen","express","clear","blunt","subtle","patient"]) * 28 - csDeduct + ((jitter + 1) % 7)));

  const boost = type === "Wedding" ? -3 : type === "Co-founder" ? 1 : 2;
  const overall = Math.min(96, Math.max(38, Math.round(pm*0.25 + vaScore*0.3 + lc*0.2 + cs*0.1 + ga*0.15) + boost));

  // ── Strengths ──
  const strengths: string[] = [];
  const aVals = a.values || a.personality || "";
  const bVals = b.values || b.personality || "";

  if (vaScore >= 68) strengths.push(pick(STRENGTH_TEMPLATES.values, hash, 0)(aVals, bVals));
  if (pm >= 72)      strengths.push(pick(STRENGTH_TEMPLATES.personality, hash, 1)(aVals, bVals));
  if (lc >= 68)      strengths.push(pick(STRENGTH_TEMPLATES.lifestyle, hash, 2)(aVals, bVals));
  if (ga >= 68)      strengths.push(pick(STRENGTH_TEMPLATES.goals, hash, 3)(aVals, bVals));
  if (cs >= 70)      strengths.push(pick(STRENGTH_TEMPLATES.communication, hash, 4)(aVals, bVals));
  while (strengths.length < 2) {
    strengths.push(pick([
      `The overlap in how they both describe ${extractWord(aVals, "what matters")} is enough to go on.`,
      "There's alignment in what neither person is willing to compromise on — that's a real start.",
      "The things they've both learned from past connections point in the same direction.",
    ], hash, strengths.length + 10));
  }

  // ── Watchpoints ──
  const watchpoints: string[] = [];
  if (vaScore < 63)  watchpoints.push(pick(WATCHPOINT_TEMPLATES.values, hash, 5)(aVals, bVals));
  if (pm < 58)       watchpoints.push(pick(WATCHPOINT_TEMPLATES.personality, hash, 6)(aVals, bVals));
  if (cs < 60)       watchpoints.push(pick(WATCHPOINT_TEMPLATES.communication, hash, 7)(aVals, bVals));
  if (ga < 58)       watchpoints.push(pick(WATCHPOINT_TEMPLATES.goals, hash, 8)(aVals, bVals));
  if (lc < 58)       watchpoints.push(pick(WATCHPOINT_TEMPLATES.lifestyle, hash, 9)(aVals, bVals));
  while (watchpoints.length < 2) {
    watchpoints.push(pick([
      `Every pair has blind spots — for this one, ${extractWord(aVals, "the quiet differences")} are worth watching.`,
      "No major flags, but don't mistake that for no work. The gaps here are subtle, not absent.",
      "The watchpoints here are less about incompatibility and more about two people who haven't figured out how to sync on a few things yet.",
    ], hash, watchpoints.length + 20));
  }

  // ── Conversation starters ──
  const allStarters: Record<string, string[][]> = {
    "Dating": [
      ["What does your ideal ordinary evening look like?","What do you need from a partner you've never quite gotten?","How do you actually handle conflict — what happens inside you when you're upset with someone close?","What would make you walk away no matter how much you liked someone?"],
      ["When did you last feel completely understood by someone? What was happening?","What's something you want in a relationship that you'd be embarrassed to say out loud?","How do you show someone you care — and does that actually land for them?","What's the thing you keep repeating in relationships that you know you need to break?"],
      ["What does loyalty mean to you, specifically — not the word, the behaviour?","What did your last connection teach you about yourself?","How much space do you need, and have you ever been honest about that?","What would make this worth it for you — really worth it?"],
    ],
    "Wedding": [
      ["Joint family or nuclear — what do you actually want, not what sounds acceptable?","Whose career takes priority if there's a real conflict — and is that actually okay with you?","How do you handle money — combined, separate, who manages what?","What would make you walk away — no exceptions, no second chances?"],
      ["What does a real partnership look like to you on an ordinary Tuesday?","How do you fight — and what happens after?","What are your honest expectations of in-laws?","What do you need from a marriage that you've never said out loud?"],
      ["What's your relationship with your own parents, and how has it shaped you?","If careers conflict, who moves — and how do you feel about that answer?","Kids — how many, how raised, whose values take precedence?","What would you regret not having said?"],
    ],
    "Friendship": [
      ["What does a good friend actually do when things get hard — specifically?","What are you done pretending to enjoy?","How do you handle it when a friend disappoints you?","What do you need in a friendship you've never quite found?"],
      ["What's a friendship you've lost, and whose fault was it really?","What do you bring to a friendship that most people can't?","When did a friend last surprise you in a good way?","What would make you feel safe being completely honest with someone?"],
      ["How do you show up when someone you care about is struggling?","What do you need from a friend that you've never asked for?","Have you ever ended a friendship you should have kept — or kept one you should have ended?","What do you actually want more of in your life right now?"],
    ],
    "Co-founder": [
      ["How do you make decisions when there's no clear answer and the clock is ticking?","If I wanted a salary before we had revenue — how would that sit with you?","What would make you walk away, even mid-build?","What decisions should I be able to make without running them by you?"],
      ["Describe a collaboration that fell apart. What was your part in it?","Are you in this for the mission, the money, or both — be straight about it?","How do you handle disagreement with someone you depend on?","What would you do if you thought I was making a serious mistake?"],
      ["What are your real strengths — not the pitch version?","What do you genuinely struggle with as a builder?","How do you think about equity, salary, and hard conversations around money?","What does a good working day look like for you, specifically?"],
    ],
    "Still Figuring Out": [
      ["What kind of connection have you had before that felt really right?","What are you done with — situations you're not going back to?","What do you need that you haven't been able to find?","What's scared you off from something you actually wanted?"],
      ["What do you find yourself drawn to in people — not what you think you should be drawn to?","What's something about yourself that you're still figuring out?","If you had to describe what you're looking for in one honest sentence, what would you say?","What kind of life do you want to be building, even if you can't see it clearly yet?"],
      ["When did you last feel really known by someone?","What's a label — dating, friendship, something else — that feels close but not quite right?","What are you most afraid of finding out about yourself through connection?","What would surprise someone if they really knew you?"],
    ],
  };

  const starterSet = pick(allStarters[type] || allStarters["Dating"], hash, 6);

  // ── Verdict ──
  const verdictKey = overall >= 80 ? "strong" : overall >= 70 ? "solid" : overall >= 58 ? "honest" : "hard";
  const verdict = pick(VERDICT_VARIANTS[verdictKey], hash, 7);

  // ── Summary ──
  const topDim = vaScore >= pm && vaScore >= lc ? "values alignment" : pm >= lc ? "personality complement" : "lifestyle compatibility";
  const lowDim = vaScore < pm && vaScore < cs ? "values" : cs < pm ? "communication styles" : "long-term direction";

  const opener = pick(SUMMARY_OPENERS, hash, 8)(type, overall);
  const middle = overall >= 72
    ? pick(SUMMARY_STRONG, hash, 9)(topDim)
    : pick(SUMMARY_WEAK, hash, 10)(lowDim);
  const close = pick(SUMMARY_CLOSE, hash, 11);

  const summary = `${opener} ${middle} ${close}`;

  return {
    overall_score: overall,
    personality_match: pm,
    values_alignment: vaScore,
    lifestyle_compatibility: lc,
    communication_styles: cs,
    goals_alignment: ga,
    summary,
    strengths: strengths.slice(0, 3),
    watchpoints: watchpoints.slice(0, 3),
    conversation_starters: starterSet,
    verdict,
  };
}
