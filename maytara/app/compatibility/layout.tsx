import type { Metadata } from "next";
import JsonLd from "../components/JsonLd";
import { pageMetadata, breadcrumbSchema, absoluteUrl, SITE, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Free AI Compatibility Check",
  description:
    "Score any two people on personality, values, lifestyle, communication and goals — or see how you rank against the whole pool. Free AI compatibility test, no account needed.",
  path: "/compatibility",
});

// A free, no-login tool: SoftwareApplication with a zero-price offer is the
// type Google uses for exactly this, and the price has to be stated or the
// offer is ignored.
const toolSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "The Mayatara Compatibility Check",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Any (web browser)",
  url: absoluteUrl("/compatibility"),
  description:
    "Free AI compatibility check that scores two people on personality, values, lifestyle, communication style and goals, and explains the result.",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  publisher: { "@id": `${SITE}/#organization` },
  provider: { "@id": `${SITE}/#organization` },
  inLanguage: "en-IN",
  creator: { "@type": "Organization", name: SITE_NAME },
};

export default function CompatibilityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="ld-compatibility-tool" data={toolSchema} />
      <JsonLd
        id="ld-breadcrumb-compatibility"
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compatibility Check", path: "/compatibility" },
        ])}
      />
      {children}
    </>
  );
}
