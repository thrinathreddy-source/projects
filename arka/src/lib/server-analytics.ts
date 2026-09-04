import { PostHog } from "posthog-node";
import { publicEnv } from "@/lib/env";

/**
 * Server-side product events.
 *
 * Anything that happens away from the browser — a render finishing, a webhook
 * granting credits — has no client to fire an event, so it goes through here.
 * A no-op when PostHog is not configured.
 */

let client: PostHog | null = null;
let attempted = false;

function getClient(): PostHog | null {
  if (attempted) return client;
  attempted = true;

  if (!publicEnv.posthogKey) return null;

  client = new PostHog(publicEnv.posthogKey, {
    host: publicEnv.posthogHost,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function track(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.capture({ distinctId: userId, event, properties });
    await posthog.flush();
  } catch {
    // Analytics must never break the operation it is describing.
  }
}
