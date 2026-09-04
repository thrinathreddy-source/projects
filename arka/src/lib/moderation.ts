
/**
 * What Arka will not draw.
 *
 * Read this first: **no filter makes offence impossible.** These are
 * probabilistic models, "offensive" is subjective and culturally contingent,
 * and someone determined will always find phrasing nobody anticipated. What
 * this file does is make the safe outcome the default and the unsafe one hard,
 * across several independent layers, so that no single bypass is sufficient.
 *
 * The layers, in order of how much work they do:
 *
 *  1. **Steering** (`settings-catalog.ts`) — every render carries safety
 *     negatives the user cannot remove, so the model is pushed away from
 *     unsafe imagery regardless of what was typed. This is the strongest
 *     layer, because it shapes what the model *can* produce rather than
 *     guessing at intent from text.
 *  2. **Input refusal** (this file) — normalised, so obfuscation does not
 *     walk straight through.
 *  3. **Output refusal** (`image-fal.ts`) — the vendor's own classifier,
 *     failed closed.
 *  4. **Takedown + audit** — the human backstop for everything above.
 *
 * The two risks specific to this product, neither of which a generic NSFW
 * classifier has ever heard of: a likeness of a real person, and a religious
 * figure depicted degradingly. The entire premise is temples, deities and
 * epics, and getting that wrong in India is a legal problem, a reputational
 * one, and in the worst case a safety one for whoever answers the door.
 *
 * **This module must stay dependency-free.** `catalog.ts` calls
 * `touchesReligion` to decide on reverent steering, and `catalog.ts` is
 * imported by client components — so anything pulled in here ends up in the
 * browser bundle. Importing the logger once dragged Prisma and `pg` in behind
 * it and broke the build outright. The throwing, logging wrapper lives in
 * `moderation-server.ts` for exactly that reason.
 *
 * The rules are built to be narrow where narrowness matters. Blocking a
 * genuine devotional prompt breaks the product for the exact customer it was
 * built for, and they will not file a bug — they will leave. So context-
 * dependent material is matched as *pairs* ("Shiva" is the product working;
 * "Shiva" beside a slur is not), and only material that is never acceptable
 * under any reading is matched on its own.
 */

export type ModerationVerdict =
  | { allowed: true }
  | { allowed: false; rule: string; message: string };

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Homoglyphs and leetspeak, folded to the letter they imitate.
 *
 * Without this the filter is decorative: `nud3`, `sh1va` and `Ｎ Ｕ Ｄ Ｅ` all
 * walk past a plain word match, and anyone testing the boundary finds that out
 * in about a minute.
 */
const FOLD: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l",
};

/**
 * Fold text into the form the rules are written against.
 *
 * Order matters. Unicode is normalised and stripped of combining marks first
 * (so `ѕhіvа` in Cyrillic lookalikes collapses), then leetspeak is folded,
 * then letters spaced out to defeat matching are rejoined, then runs of a
 * repeated character are collapsed.
 *
 * Everything downstream still matches on **word boundaries**, which is what
 * keeps `analysis` from tripping a rule about `anal` — the classic way these
 * filters embarrass themselves.
 */
export function normalise(text: string): string {
  let out = text
    .normalize("NFKD")
    // Combining marks: accents, and the "zalgo" trick of stacking them.
    .replace(/[̀-ͯ]/g, "")
    // Zero-width characters, inserted between letters to break matches.
    .replace(/[​-‏⁠﻿]/g, "")
    .toLowerCase();

  out = out.replace(/[0134578@$!|+€£]/g, (char) => FOLD[char] ?? char);

  // `s.h.i.v.a` / `s h i v a` -> `shiva`. Only runs of three or more single
  // characters, so ordinary prose with initials is left alone.
  out = out.replace(/\b(?:[a-z][^a-z0-9]{1,2}){2,}[a-z]\b/g, (run) =>
    run.replace(/[^a-z0-9]/g, ""),
  );

  // `shiiiiiva` -> `shiiva`. Two is kept because English has doubles.
  out = out.replace(/(.)\1{2,}/g, "$1$1");

  return out.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary matcher, so `assassinate` never trips a match on `ass`. */
function word(...terms: string[]): RegExp {
  return new RegExp(`\\b(${terms.map(escape).join("|")})\\b`, "i");
}

/**
 * Stem matcher: the term plus any suffix.
 *
 * `word("disembowel")` does not match "disembowelled", because the boundary it
 * demands is not there — and a filter that blocks the infinitive while passing
 * the past participle is not a filter. Verbs need stems.
 *
 * Reserved for long, unambiguous terms. A stem on something short collects
 * innocent words: this is why `rape` stays an exact word (or `rapeseed` is
 * contraband) and `cp` is not in the vocabulary at all.
 */
function stem(...terms: string[]): RegExp {
  return new RegExp(`\\b(${terms.map(escape).join("|")})[a-z]*\\b`, "i");
}

/** Naming a real, identifiable person. */
const LIKENESS = word(
  "modi", "narendra modi", "rahul gandhi", "amit shah", "president",
  "prime minister", "chief minister", "celebrity", "actress", "actor",
  "real person", "my ex", "my classmate", "my teacher", "my neighbour",
  "my neighbor", "my boss", "my colleague", "my friend's",
);

/** Asking for a likeness *of* someone rather than merely mentioning one. */
const LIKENESS_INTENT = word(
  "photorealistic", "photo realistic", "deepfake", "deep fake", "face swap",
  "faceswap", "lookalike", "look alike", "exact likeness", "real face",
  "actual face", "his face", "her face", "their face",
);

const DEITY = word(
  "shiva", "vishnu", "krishna", "rama", "ram", "hanuman", "ganesha", "ganesh",
  "durga", "kali", "lakshmi", "saraswati", "murugan", "ayyappa", "parvati",
  "brahma", "indra", "allah", "muhammad", "prophet", "jesus", "christ", "mary",
  "guru nanak", "buddha", "mahavira", "deity", "god", "goddess", "quran",
  "bible", "vedas", "gita", "temple idol", "mosque", "church", "gurudwara",
);

/**
 * Terms that degrade the *figure*, not terms that describe what the figure did.
 *
 * The distinction is the whole difficulty, and getting it wrong is how this
 * filter starts refusing its own canon. `burning` was here, which blocked
 * "hanuman burning lanka" — the single most famous scene in the Ramayana.
 * `destroying` blocked Shiva as destroyer, `slaughter` blocked Kurukshetra,
 * `smoking` blocked traditional chillum iconography, and `kissing` blocked
 * Radha-Krishna devotional art. All removed.
 *
 * This is a deliberate loosening. A word-level rule cannot tell "Hanuman burns
 * Lanka" from "burning Hanuman", and between the two failures, refusing the
 * canon is the one that kills the product. The safety negatives on every
 * render and the vendor's output classifier both still apply here — which is
 * exactly why the layers exist and why this layer is allowed to be narrow.
 */
const DEGRADING = word(
  "nude", "naked", "topless", "sexual", "sexy", "erotic", "porn",
  "mocking", "mock", "insulting", "insult", "urinating", "defecating", "drunk",
  "eating beef", "desecrating", "desecrate", "toilet", "obscene",
  "ridiculing", "ridicule", "spitting", "trampling", "vandalising",
  "vandalizing", "defiling", "defile", "humiliating", "humiliate",
);

const MINOR = word(
  "child", "children", "kid", "kids", "toddler", "infant", "baby", "schoolgirl",
  "schoolboy", "teen", "teenage", "underage", "minor", "young girl", "young boy",
);

const SEXUAL = word(
  "nude", "naked", "topless", "sexual", "sexy", "erotic", "porn", "lingerie",
  "bikini", "seductive", "provocative", "undressing", "aroused", "fetish",
);

const VIOLENCE_TARGET = word(
  "muslim", "muslims", "hindu", "hindus", "sikh", "sikhs", "christian",
  "christians", "dalit", "dalits", "brahmin", "brahmins", "jew", "jews",
  "caste", "adivasi", "refugee", "refugees", "immigrant", "immigrants",
);

const VIOLENCE = word(
  "lynching", "lynch", "massacre", "genocide", "riot", "rioting", "killing",
  "murdering", "beheading", "hanging", "burning alive", "attack", "attacking",
  "cleansing", "exterminate", "extermination",
);

/**
 * Never acceptable under any reading, so matched alone.
 *
 * Deliberately short. Everything context-dependent belongs in the pairs above,
 * because a single-term block on ordinary language is how a filter starts
 * refusing the product's own subject matter.
 */
const NEVER: { id: string; pattern: RegExp; message: string }[] = [
  {
    id: "csam",
    pattern: new RegExp(
      [
        word("loli", "shota", "lolicon", "shotacon", "childporn").source,
        stem("child porn", "child pornography", "underage sex", "preteen").source,
      ].join("|"),
      "i",
    ),
    message: "This request is refused, and refusing it is not negotiable.",
  },
  {
    id: "sexual.explicit",
    pattern: new RegExp(
      [
        // Exact: `rape` stems into `rapeseed`, `xxx` and `nsfw` take no suffix.
        word("xxx", "nsfw", "rape", "penis", "vagina").source,
        stem(
          "porn", "hentai", "genital", "masturbat", "orgasm", "intercourse",
          "molest", "fellatio", "copulat",
        ).source,
      ].join("|"),
      "i",
    ),
    message:
      "Arka does not generate sexual content. It is built for stories, myth and folklore.",
  },
  {
    id: "gore.graphic",
    pattern: new RegExp(
      [
        word("gore", "gory", "entrails", "snuff").source,
        stem(
          "disembowel", "dismember", "mutilat", "decapitat", "beheading",
          "eviscerat", "tortur", "flay",
        ).source,
      ].join("|"),
      "i",
    ),
    message:
      "Arka does not generate graphic gore. Stylised epic battle is fine; this is not.",
  },
  {
    id: "hate.slur",
    pattern: word("terrorist scum", "vermin", "subhuman", "untouchable scum"),
    message: "Arka does not generate dehumanising content.",
  },
];

type PairRule = { id: string; requires: RegExp[]; message: string };

const PAIRS: PairRule[] = [
  {
    id: "likeness.realPerson",
    requires: [LIKENESS, LIKENESS_INTENT],
    message:
      "Arka will not generate a likeness of a real person. Describe a character instead — age, dress, bearing — and the model will invent a face.",
  },
  {
    id: "religion.degrading",
    requires: [DEITY, DEGRADING],
    message:
      "Arka will not render a religious figure this way. Devotional and mythological scenes are exactly what this is built for; this particular request is not one.",
  },
  {
    id: "minors.sexualised",
    requires: [MINOR, SEXUAL],
    message: "This request is refused, and refusing it is not negotiable.",
  },
  {
    id: "violence.communal",
    requires: [VIOLENCE_TARGET, VIOLENCE],
    message: "Arka will not depict violence against a religious or caste group.",
  },
];

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

/**
 * Check the text a user actually wrote.
 *
 * Pairs are evaluated before the never-list so that a refusal carries the most
 * specific explanation available — someone asking for a degrading depiction of
 * a deity is better served by being told that than by a generic notice.
 *
 * Runs on the raw prompt and script, before the lexicon expands them. The
 * expansion adds our own words, and matching those would be marking our own
 * homework.
 */
export function moderate(text: string): ModerationVerdict {
  const subject = normalise(text);

  for (const rule of PAIRS) {
    if (rule.requires.every((pattern) => pattern.test(subject))) {
      return { allowed: false, rule: rule.id, message: rule.message };
    }
  }

  for (const rule of NEVER) {
    if (rule.pattern.test(subject)) {
      return { allowed: false, rule: rule.id, message: rule.message };
    }
  }

  return { allowed: true };
}

/** Does this prompt concern religious material? Drives reverent steering. */
export function touchesReligion(text: string): boolean {
  return DEITY.test(normalise(text));
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * Prompts that are probably fine but worth a person's eye.
 *
 * The filter above is a binary, and a binary resolves every ambiguous case by
 * guessing. On a product whose subject is religion, ambiguous is common: a
 * named deity in an unusual situation is almost always devotional and
 * occasionally is not, and refusing all of them breaks the canon while allowing
 * all of them means finding out from a screenshot.
 *
 * So this is a third outcome. It does not block anything — the render proceeds
 * exactly as normal — it only says a human should see the result afterwards.
 * Being wrong here costs a moment of someone's attention, which is why it can
 * afford to be much broader than the refusal rules.
 */
const REVIEW_TRIGGERS: { reason: string; requires: RegExp[] }[] = [
  {
    // A deity plus death, nudity-adjacent, or intoxication. All appear in the
    // canon; all are also how a bad-faith prompt would be phrased.
    reason: "religion.sensitive",
    // Stemmed, not exact. "skull" missed "skulls", which is how the phrase is
    // actually written — and a review trigger that misses the common spelling
    // is worse than useless, because it looks like coverage.
    requires: [
      DEITY,
      stem(
        "blood", "corpse", "dead", "death", "dying", "sever", "skull",
        "bare", "undress", "bathing", "intoxicat", "drunk", "wine",
        "meat", "beef", "sacrific", "tortur",
      ),
    ],
  },
  {
    // A named real person in any framing, even without likeness intent.
    reason: "likeness.mentioned",
    requires: [LIKENESS],
  },
  {
    // A group named alongside conflict, short of the incitement rule.
    reason: "communal.sensitive",
    requires: [
      VIOLENCE_TARGET,
      stem("war", "conflict", "protest", "police", "army", "weapon", "burn"),
    ],
  },
];

export type ReviewFlag = { reason: string } | null;

/**
 * Should a human look at this after it renders? Never blocks.
 */
export function needsReview(text: string): ReviewFlag {
  const subject = normalise(text);

  for (const trigger of REVIEW_TRIGGERS) {
    if (trigger.requires.every((pattern) => pattern.test(subject))) {
      return { reason: trigger.reason };
    }
  }

  return null;
}
