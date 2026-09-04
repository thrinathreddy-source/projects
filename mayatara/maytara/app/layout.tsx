import type { Metadata, Viewport } from "next";
import { Special_Elite, Courier_Prime, IM_Fell_English } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Attribution from "./components/Attribution";
import JsonLd from "./components/JsonLd";
import {
  SITE,
  SITE_NAME,
  LOCALE,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  KEYWORDS,
  organizationSchema,
  websiteSchema,
} from "@/lib/seo";

// Self-hosted at build time. These used to come from fonts.googleapis.com via
// a <link> in <head> *and* an @import in globals.css — two render-blocking
// round trips to a third party before a single letter could paint, which is
// exactly what Core Web Vitals (an actual ranking signal) measures. Now they
// ship from our own origin with the CSS-variable handoff below.
// Origin only — never the anon key or any path.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const typewriter = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-typewriter",
  fallback: ["Courier New", "monospace"],
});

const body = Courier_Prime({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  fallback: ["Courier New", "monospace"],
});

// Decorative, and used for exactly one italic line near the bottom of two
// pages — but its two faces are 114 KB, more than every other font combined.
// `preload: false` keeps them off the critical path; they still load when the
// rule that uses them is matched.
const serifIndia = IM_Fell_English({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-serif-india",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  // metadataBase makes the generated opengraph-image resolve to an absolute
  // URL — social crawlers reject relative ones.
  metadataBase: new URL(SITE),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "social",
  // Self-referencing canonical on the home page; every other route overrides
  // it with its own in lib/seo.ts.
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Without these Google clips the snippet and refuses a large thumbnail,
      // which costs real click-through on brand and long-tail queries.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  // Phone numbers and dates in body copy were being auto-linked by iOS Safari,
  // which rewrites the DOM under us.
  formatDetection: { telephone: false, address: false, email: false },
  // No `icons` block on purpose: app/favicon.ico, app/icon.png and
  // app/apple-icon.png are file-based metadata, which takes priority over
  // anything declared here. Two sources for the same tag only invited drift —
  // the apple-touch-icon was pointing at a 497x502 logo that iOS then squashed
  // into its rounded square; app/apple-icon.png is a proper padded 180x180.
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "The Mayatara — find your person, every Friday",
    description: "Five honest questions. One match a week. No swiping, no scrolling.",
    url: SITE,
    locale: LOCALE,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Mayatara — find your person, every Friday",
    description: "Five honest questions. One match a week. No swiping, no scrolling.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#F2E4C4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${typewriter.variable} ${body.variable} ${serifIndia.variable}`}>
      <head>
        {/* Every page asks Supabase for the session as soon as it mounts. Warming
            the TLS connection while the page is still parsing takes that round
            trip off the critical path. */}
        {SUPABASE_ORIGIN && (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        )}
      </head>
      <body className="min-h-screen relative z-10">
        {/* Site-wide entity graph. Declared once at the root so every page
            inherits the publisher identity that page-level schema points at. */}
        <JsonLd id="ld-organization" data={organizationSchema()} />
        <JsonLd id="ld-website" data={websiteSchema()} />
        {children}
        <Attribution />
        <Analytics />
        {/* Field Core Web Vitals from real visitors. Search Console's own CWV
            report is CrUX data on a 28-day trailing window, so it can't tell
            you what a change did until a month after you shipped it. This can,
            per route. Same-origin in production; the third-party debug build it
            uses in development is covered by the dev-only CSP exception. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
