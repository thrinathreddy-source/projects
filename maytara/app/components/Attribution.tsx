"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Stamps the visit with where it came from, on whichever page the visitor
 * happens to land on first. Mounted once in the root layout; renders nothing.
 *
 * Reads window.location directly rather than useSearchParams() so it doesn't
 * drag the static landing page into dynamic rendering or need a Suspense
 * boundary around it.
 */
export default function Attribution() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
