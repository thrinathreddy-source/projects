import type { Metadata } from "next";

// Single source of truth for everything that ends up in <head> or in a
// crawler's index. Canonicals, the sitemap and the structured data all have to
// agree on one host — apex/www disagreement is what splits a domain's ranking
// between two "different" sites. next.config.ts 301s the apex to www; this
// constant is the www side of that contract.
export const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://www.themayatara.com").replace(/\/$/, "");

export const SITE_NAME = "The Mayatara";
export const LOCALE = "en_IN";

// The host as a human types or reads it — printed on share cards and PDFs, and
// used in share text. Derived from SITE so it can never point somewhere the
// site isn't; the apex 308s to www, so the short form works as a link too.
export const SITE_DISPLAY = new URL(SITE).host.replace(/^www\./, "");

export const DEFAULT_TITLE = "The Mayatara — One AI Match Every Friday, Free in India";
export const DEFAULT_DESCRIPTION =
  "Answer five honest questions. Our AI finds you one real match every Friday — dating, friendship, co-founder or marriage. Free, private, made in India.";

// Meta keywords carry no weight with Google, but they cost nothing and other
// engines (and a few AI crawlers) still read them. Kept to terms the page
// actually earns.
export const KEYWORDS = [
  "AI matchmaking India",
  "free dating app India",
  "one match a week",
  "AI compatibility test",
  "find your person",
  "friendship app India",
  "co-founder matching India",
  "alternative to dating apps",
  "no swiping dating",
  "The Mayatara",
];

export function absoluteUrl(path = "/"): string {
  return path === "/" ? SITE : `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Per-route metadata. Every public page gets a self-referencing canonical (the
 * single most effective defence against duplicate-URL dilution) plus Open
 * Graph and Twitter copy that matches its own content rather than the site's.
 */
export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const canonical = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: canonical,
      locale: LOCALE,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
    },
    ...(index ? {} : { robots: { index: false, follow: false, nocache: true } }),
  };
}

/**
 * Metadata for signed-in surfaces. `noindex` is the only instruction Google
 * actually honours for de-indexing — a robots.txt `Disallow` merely stops the
 * crawl, which can leave a bare URL in results forever. So these routes stay
 * crawlable and say "no" in the page itself.
 */
export function privateMetadata(title: string): Metadata {
  return {
    title,
    // Drops the inherited `canonical: "/"`. A noindex page that also points its
    // canonical at the home page sends two contradictory instructions, and
    // Google resolves that contradiction however it likes.
    alternates: null,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  };
}

// ── Structured data ─────────────────────────────────────────────────────────
// Everything below describes only what is visibly on the page. Schema that
// promises more than the page shows is what triggers manual actions.

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE}/#organization`,
    name: SITE_NAME,
    alternateName: "Mayatara",
    url: SITE,
    logo: {
      "@type": "ImageObject",
      url: `${SITE}/logo.png`,
      width: 497,
      height: 502,
    },
    image: `${SITE}/opengraph-image`,
    description: DEFAULT_DESCRIPTION,
    slogan: "For the real ones.",
    areaServed: { "@type": "Country", name: "India" },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: absoluteUrl("/contact"),
        availableLanguage: ["English"],
      },
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    url: SITE,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": `${SITE}/#organization` },
  };
}

export function breadcrumbSchema(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}
