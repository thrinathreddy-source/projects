import type { Metadata } from "next";
import JsonLd from "../components/JsonLd";
import { pageMetadata, breadcrumbSchema, absoluteUrl, SITE } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Report & Contact",
  description:
    "One channel, read by a person: report abuse or a safety concern, raise a grievance, delete your account, or correct and export your data.",
  path: "/contact",
});

const contactSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Report & Contact",
  url: absoluteUrl("/contact"),
  isPartOf: { "@id": `${SITE}/#website` },
  about: { "@id": `${SITE}/#organization` },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd id="ld-contact" data={contactSchema} />
      <JsonLd
        id="ld-breadcrumb-contact"
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Report & Contact", path: "/contact" },
        ])}
      />
      {children}
    </>
  );
}
