import type { MetadataRoute } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";

// Public, indexable pages only. Anything carrying `noindex` is deliberately
// absent — listing a noindex URL in a sitemap is a contradiction Search
// Console reports as an error.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
      images: [`${SITE}/opengraph-image`],
    },
    { url: absoluteUrl("/register"),      lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/compatibility"), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/philosophy"),    lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/login"),         lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: absoluteUrl("/terms"),         lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: absoluteUrl("/contact"),       lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];
}
