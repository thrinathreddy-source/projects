import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Only the API is blocked from crawling. The signed-in surfaces
        // (/dashboard, /match, /interview, the password flows) are kept
        // crawlable on purpose and carry `noindex` in their own metadata —
        // a Disallow here would stop Google reading that instruction, which
        // is how blocked URLs end up listed with no description at all.
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
