/**
 * First-touch signup attribution — browser side.
 *
 * Deliberately first-party and minimal: the UTM tags we put on our own links,
 * plus the bare hostname of whatever referred the visit. No third-party pixel,
 * no cross-site identifier, no full referring URL (those routinely carry
 * search terms and session tokens in their query strings). That keeps this
 * consistent with the terms, which promise nothing goes to third parties for
 * advertising.
 *
 * First-touch, not last-touch: whichever channel actually brought someone in
 * is the one worth crediting, so once a visit has been stamped we leave it
 * alone even if they later arrive again through a different link.
 */

const KEY = "mayatara_attribution";

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  landing?: string;
}

/** Records the current visit's origin, if this session hasn't been stamped yet. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  try {
    if (sessionStorage.getItem(KEY)) return; // already stamped — first touch wins

    const params = new URLSearchParams(window.location.search);
    const utm = (k: string) => (params.get(k) || "").trim().slice(0, 120) || undefined;

    // Hostname only. A full referrer URL is a privacy liability we have no use for.
    let referrer: string | undefined;
    try {
      if (document.referrer) {
        const host = new URL(document.referrer).hostname;
        if (host && host !== window.location.hostname) referrer = host;
      }
    } catch { /* malformed referrer — ignore it */ }

    const source = utm("utm_source") ?? (referrer ? referrer : "direct");
    const medium = utm("utm_medium") ?? (referrer ? "referral" : "none");

    const attribution: Attribution = {
      source,
      medium,
      campaign: utm("utm_campaign"),
      referrer,
      landing: window.location.pathname.slice(0, 120),
    };

    sessionStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* sessionStorage blocked (private mode, embedded webview) — attribution is
       nice to have, never worth breaking a page over */
  }
}

/** Reads back what captureAttribution stored. Empty object if nothing was. */
export function readAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}
