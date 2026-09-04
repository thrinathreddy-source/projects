import { readdirSync } from "node:fs";
import path from "node:path";
import { SETTINGS } from "@/lib/settings-catalog";
import { VIDEO_STYLES } from "@/lib/catalog";

/**
 * The published demonstrations.
 *
 * Free credits used to do the convincing: a stranger signed up, spent our money
 * on five stills, and owed us nothing. That is the one cost incurred before any
 * revenue exists, and a bootstrapped business cannot carry it. These clips do
 * the same job for a fixed price — rendered once by us, shown to everyone.
 *
 * Assets live in `public/showcase/` and are served as static files: no signed
 * URLs, no R2 egress, no per-view cost. Add an entry here, drop the matching
 * files in, and it appears. Entries whose files are missing are dropped rather
 * than rendered as broken frames, so a half-finished showcase never ships.
 */

export type ShowcaseItem = {
  /** Basename shared by the poster and clip, e.g. "meenakshi-dawn". */
  slug: string;
  title: string;
  /** The prompt that produced it. Shown verbatim — the honesty is the point. */
  prompt: string;
  /** Ids from SETTINGS and VIDEO_STYLES. */
  setting: string;
  style: string;
  /** Seconds of finished video. */
  durationSec: number;
};

/**
 * Curated, in display order.
 *
 * Kept deliberately short. Eight strong clips persuade; forty mediocre ones
 * advertise the mediocre ones. Every entry should survive the question the
 * whole lexicon rests on: does this look like the place it claims to be?
 */
export const SHOWCASE: readonly ShowcaseItem[] = [];

/**
 * Which showcase entries actually have their files on disk.
 *
 * Read at build time on the server. A missing poster means the entry is
 * skipped: a landing page with empty frames is worse than a shorter one.
 */
export function availableShowcase(): ShowcaseItem[] {
  if (SHOWCASE.length === 0) return [];

  let present: Set<string>;
  try {
    present = new Set(readdirSync(path.join(process.cwd(), "public", "showcase")));
  } catch {
    return []; // Directory absent — nothing has been published yet.
  }

  return SHOWCASE.filter((item) => present.has(`${item.slug}.jpg`));
}

/** Label lookups, so the showcase names settings and styles the way the app does. */
export function labelsFor(item: ShowcaseItem): { setting: string; style: string } {
  return {
    setting: SETTINGS.find((entry) => entry.id === item.setting)?.label ?? item.setting,
    style: VIDEO_STYLES.find((entry) => entry.id === item.style)?.label ?? item.style,
  };
}
