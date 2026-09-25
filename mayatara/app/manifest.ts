import type { MetadataRoute } from "next";
import { SITE_NAME, DEFAULT_DESCRIPTION } from "@/lib/seo";

// Makes the site installable and gives Android/Chrome a real name, colour and
// icon instead of a screenshot of the tab. Also what Lighthouse's PWA and
// "installable" checks read.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — one AI match, every Friday`,
    short_name: "Mayatara",
    description: DEFAULT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2E4C4",
    theme_color: "#D4600A",
    lang: "en-IN",
    dir: "ltr",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
