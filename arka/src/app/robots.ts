import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * Everything behind auth is disallowed — not as a security measure (the routes
 * check sessions themselves) but because a crawler following them only ever
 * reaches a sign-in redirect, which is a wasted crawl budget on a site whose
 * indexable surface is four marketing pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/generate",
        "/projects",
        "/billing",
        "/settings",
        "/suspended",
      ],
    },
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
