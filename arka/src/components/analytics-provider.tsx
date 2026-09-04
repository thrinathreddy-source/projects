"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import posthog from "posthog-js";
import { publicEnv } from "@/lib/env";

/**
 * PostHog, wired so the app is identical with or without a key configured.
 * Without one, every call below is a no-op and no network request is made.
 */

let initialised = false;

function ensureInitialised() {
  if (initialised || !publicEnv.posthogKey || typeof window === "undefined") return;

  posthog.init(publicEnv.posthogKey, {
    api_host: publicEnv.posthogHost,
    // We send pageviews ourselves so App Router client navigations are counted.
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  initialised = true;
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    ensureInitialised();
    if (!initialised) return;

    const query = searchParams.toString();
    posthog.capture("$pageview", {
      $current_url: `${window.location.origin}${pathname}${query ? `?${query}` : ""}`,
    });
  }, [pathname, searchParams]);

  return null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* useSearchParams needs a Suspense boundary to avoid opting the whole
          tree into client-side rendering. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}

/** Fire-and-forget product event. Safe to call when analytics is disabled. */
export function track(event: string, properties?: Record<string, unknown>) {
  ensureInitialised();
  if (!initialised) return;
  posthog.capture(event, properties);
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  ensureInitialised();
  if (!initialised) return;
  posthog.identify(userId, traits);
}

export function resetAnalytics() {
  if (!initialised) return;
  posthog.reset();
}
