import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/**
 * The public surface, which is deliberately small.
 *
 * Only pages a signed-out visitor can actually read belong here. The legal
 * pages are included because Razorpay's reviewers reach them from search as
 * often as customers do, and an unindexed refund policy is a reason to fail an
 * activation review.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.appUrl.replace(/\/$/, "");
  const lastModified = new Date();

  const pages: { path: string; priority: number; changeFrequency: "monthly" | "yearly" }[] =
    [
      { path: "", priority: 1, changeFrequency: "monthly" },
      { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
      { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
      // Indexed deliberately: the grievance route has to be findable by someone
      // who has a complaint and no account, which is the point of publishing it.
      { path: "/acceptable-use", priority: 0.4, changeFrequency: "yearly" },
      { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
      { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
      { path: "/refunds", priority: 0.3, changeFrequency: "yearly" },
    ];

  return pages.map((page) => ({
    url: `${base}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
