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
  /\brape\b/i,
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
  /\bescort\s+service\b/i,
];

const MINOR_INDICATOR = /\b(minor|underage|under\s?18|child|kid|teen(ager)?)\b/i;
const SEXUAL_INDICATOR = /\bsex(ual)?\b|\bnude\b|\bexplicit\b/i;

export async function checkContentSafety(texts: string[]): Promise<{ flagged: boolean; reason?: string }> {
  const combined = texts.filter(Boolean).join(" \n ").trim();
  if (!combined) return { flagged: false };

  for (const pattern of VIOLENCE_PATTERNS) {
    if (pattern.test(combined)) return { flagged: true, reason: "violence" };
  }
  for (const pattern of SEXUAL_EXPLICIT_PATTERNS) {
    if (pattern.test(combined)) return { flagged: true, reason: "sexual" };
  }
  if (MINOR_INDICATOR.test(combined) && SEXUAL_INDICATOR.test(combined)) {
    return { flagged: true, reason: "sexual/minors" };
  }

  return { flagged: false };
}
