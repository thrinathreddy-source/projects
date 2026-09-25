import { absoluteUrl } from "@/lib/seo";

/**
 * A compatibility result, small enough to live in a URL.
 *
 * Shared results carry no names and no answers — only the number that was on
 * screen. A story card is something the sharer chose to post; a link gets
 * forwarded, and nobody down the chain consented to two real people's names
 * being in it. The scores alone are the interesting part anyway.
 */
export const SHARE_TYPES = ["pair", "global"] as const;
export type ShareType = (typeof SHARE_TYPES)[number];

export const RELATIONSHIP_TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];

export interface SharedResult {
  type: ShareType;
  /** 0–100, pair checks only. */
  score: number | null;
  /** 0–100, global checks only. */
  percentile: number | null;
  verdict: string;
  lookingFor: string;
}

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function clampInt(raw: string, min: number, max: number): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/**
 * Read a result out of a query string. Everything is clamped or dropped —
 * these values are typed by whoever holds the link, not by us. Returns null
 * when the number that gives the page its point is missing or unusable.
 */
export function parseSharedResult(params: Params): SharedResult | null {
  const type: ShareType = one(params.t) === "global" ? "global" : "pair";

  const score = type === "pair" ? clampInt(one(params.s), 0, 100) : null;
  const percentile = type === "global" ? clampInt(one(params.p), 0, 100) : null;
  if (type === "pair" && score === null) return null;
  if (type === "global" && percentile === null) return null;

  const rawFor = one(params.f);
  const lookingFor = RELATIONSHIP_TYPES.includes(rawFor) ? rawFor : "";

  // Free text from the model, so cap it rather than trust it.
  const verdict = one(params.v).slice(0, 40).replace(/[\r\n]+/g, " ").trim();

  return { type, score, percentile, verdict, lookingFor };
}

function toQuery(result: SharedResult): string {
  const q = new URLSearchParams();
  q.set("t", result.type);
  if (result.type === "pair" && result.score !== null) q.set("s", String(result.score));
  if (result.type === "global" && result.percentile !== null) q.set("p", String(result.percentile));
  if (result.verdict) q.set("v", result.verdict);
  if (result.lookingFor) q.set("f", result.lookingFor);
  return q.toString();
}

/** The link a person shares. Absolute — it gets pasted into other apps. */
export function shareUrl(result: SharedResult): string {
  return `${absoluteUrl("/compatibility/r")}?${toQuery(result)}`;
}

/** The 1200x630 preview image for that link. */
export function shareImageUrl(result: SharedResult): string {
  return `${absoluteUrl("/compatibility/r/card")}?${toQuery(result)}`;
}

/** Headline for the page and its <title>, where there is room to read. */
export function headline(result: SharedResult): string {
  return result.type === "global"
    ? `Top ${100 - (result.percentile ?? 0)}% of the pool`
    : `${result.score}/100`;
}

/**
 * Headline for the preview image, which sets it at 120px on one line — the
 * full phrase wrapped to two and swallowed the card.
 */
export function shortHeadline(result: SharedResult): string {
  return result.type === "global"
    ? `Top ${100 - (result.percentile ?? 0)}%`
    : `${result.score}/100`;
}

export function subhead(result: SharedResult): string {
  // An unrecognised `f=` leaves lookingFor empty; the generic wording has to
  // stand on its own rather than being slotted into the phrase, or the title
  // reads "Compatibility compatibility on The Mayatara".
  const context = result.lookingFor.toLowerCase();

  if (result.type === "global") {
    return context
      ? `Global fit check for ${context} on The Mayatara`
      : "Global fit check on The Mayatara";
  }
  return context
    ? `${context.charAt(0).toUpperCase()}${context.slice(1)} compatibility on The Mayatara`
    : "Compatibility check on The Mayatara";
}
