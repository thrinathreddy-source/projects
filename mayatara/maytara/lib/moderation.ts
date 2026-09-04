/**
 * Screens free-text fields for violent or sexually explicit content at
 * registration and profile-submission time, so accounts that don't belong
 * in the pool never make it in. Pure keyword/regex matching — no external
 * API calls, no tokens, no cost. Trades some precision for running entirely
 * on our own code. AI-backed version parked in lib/moderation.ai.ts — swap
 * the import at the two call sites when we're ready to pay for it again.
 */

const VIOLENCE_PATTERNS: RegExp[] = [
  /\bkill(ing|ed)?\s+(you|him|her|them|myself|people)\b/i,
  /\bmurder(er|ed|ing)?\b/i,
  /\b(mass\s+)?shoot(ing|er)?\b/i,
  /\bstab(bing|bed)?\b/i,
  /\bassault(ing|ed)?\b/i,
  /\btortur(e|ing|ed)\b/i,
  /\bbeat(ing)?\s+(you|him|her|them|someone)\s+up\b/i,
  /\brap(e|es|ing|ist)\b/i,
  /\bmutilat(e|ion|ing)\b/i,
  /\b(gun|knife)\s+violence\b/i,
  /\bterroris(m|t)\b/i,
];

const SEXUAL_EXPLICIT_PATTERNS: RegExp[] = [
  /\bsex(ual)?\s+(services|for\s+hire|worker)\b/i,
  /\bnude(s)?\s+(pic|photo|picture)/i,
  /\bnsfw\b/i,
  /\bxxx\b/i,
  /\bhookup\s+only\b/i,
  /\bsend\s+nudes\b/i,
  /\bexplicit\s+content\b/i,
  /\bporn(ographic|ography)?\b/i,
  /\bescort\s+services?\b/i,
];

// Plurals are matched explicitly. \bminor\b does not match "minors" — the word
// boundary fails against the trailing s — so "sexual pics of minors" passed this
// check entirely, along with "kids", "children" and "teens". Singular-only
// patterns in a child-safety filter are the one place a near-miss is not
// acceptable.
const MINOR_PATTERN = /\b(minors?|underage|under\s?18|child(ren)?|kids?|teen(ager)?s?)\b/gi;
const SEXUAL_PATTERN = /\bsex(ual|ually)?\b|\bnudes?\b|\bexplicit\b/gi;

// Matching the plurals above widens the net enough that scanning the whole blob
// for each term independently would start flagging ordinary answers: "I want
// kids someday" in one sentence and "sexual compatibility matters" in the next
// are both things people write here honestly, and rejecting that signup with a
// message about explicit content would be both wrong and insulting.
//
// The two terms have to land in the *same sentence* to count, with a character
// window inside it as a second guard for long run-on sentences. That is what
// separates the two classes in practice — the phrasings this rule exists to
// catch put the words a few words apart in one clause, while the innocent
// collisions sit either side of a full stop.
const PROXIMITY_CHARS = 60;

function sexualisedMinorReference(text: string): boolean {
  for (const sentence of text.split(/[.!?\n]+/)) {
    // Fresh matchAll per sentence: these regexes carry /g, and a /g regex
    // reused with .test() advances lastIndex between calls and skips matches.
    const minors = [...sentence.matchAll(MINOR_PATTERN)].map(m => m.index ?? 0);
    if (minors.length === 0) continue;
    const sexual = [...sentence.matchAll(SEXUAL_PATTERN)].map(m => m.index ?? 0);
    if (sexual.length === 0) continue;
    if (minors.some(m => sexual.some(x => Math.abs(m - x) <= PROXIMITY_CHARS))) return true;
  }
  return false;
}

// Zero-width characters (U+200B-U+200D, U+FEFF) are invisible and defeat every
// \b-anchored pattern above by splitting a flagged word in two ("min​ors").
// NFKC additionally folds compatibility variants (full-width letters etc.) down
// to their plain ASCII form. Neither transform can turn safe text into flagged
// text, so this only closes bypasses — it can't introduce new false positives.
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200D\\uFEFF]", "g");

function normalise(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH, "");
}

export async function checkContentSafety(texts: string[]): Promise<{ flagged: boolean; reason?: string }> {
  const combined = normalise(texts.filter(Boolean).join(" \n ").trim());
  if (!combined) return { flagged: false };

  for (const pattern of VIOLENCE_PATTERNS) {
    if (pattern.test(combined)) return { flagged: true, reason: "violence" };
  }
  for (const pattern of SEXUAL_EXPLICIT_PATTERNS) {
    if (pattern.test(combined)) return { flagged: true, reason: "sexual" };
  }
  if (sexualisedMinorReference(combined)) {
    return { flagged: true, reason: "sexual/minors" };
  }

  return { flagged: false };
}
