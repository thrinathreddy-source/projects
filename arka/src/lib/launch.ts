/**
 * Whether the public site is open for business yet.
 *
 * **Defaults to closed in production.** A deploy that forgets to set anything
 * shows a holding page rather than a signup form wired to an account nobody
 * can verify, a generator with no model behind it, and a checkout that cannot
 * take money. Opening is the deliberate act; being closed is the safe state.
 *
 * Development is unaffected, so nothing about local work changes.
 *
 * Deliberately readable from both the edge and the browser: `proxy.ts` runs on
 * the edge and needs it to gate routes, so this reads `process.env` directly
 * and imports nothing.
 */

export type LaunchMode = "coming-soon" | "live";

export function launchMode(): LaunchMode {
  const explicit = process.env.NEXT_PUBLIC_LAUNCH_MODE;
  if (explicit === "live" || explicit === "coming-soon") return explicit;

  // Unset: open locally, closed in production.
  return process.env.NODE_ENV === "production" ? "coming-soon" : "live";
}

export function isComingSoon(): boolean {
  return launchMode() === "coming-soon";
}

/**
 * What the holding page promises.
 *
 * Configurable because a hard-coded "in a week" becomes untrue in eight days
 * and then sits on the internet being untrue indefinitely. Set it to something
 * you will actually hit, or leave the default, which makes no dated claim.
 */
export function launchPromise(): string {
  return process.env.NEXT_PUBLIC_LAUNCH_PROMISE || "Opening shortly.";
}

/**
 * Paths that stay reachable while closed.
 *
 * The legal pages are here because the holding page collects email addresses,
 * and collecting an address while the privacy policy 404s is the kind of thing
 * this whole product is supposed to be better than.
 */
export const PUBLIC_WHILE_CLOSED = [
  "/",
  "/terms",
  "/privacy",
  "/refunds",
  "/contact",
  "/acceptable-use",
];
