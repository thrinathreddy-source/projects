import type { Metadata } from "next";
import JsonLd from "../components/JsonLd";
import { pageMetadata, breadcrumbSchema } from "@/lib/seo";

// The page itself is a Client Component, so its metadata lives here — the
// `metadata` export is Server-Component only.
export const metadata: Metadata = pageMetadata({
  title: "Create Your Free Account",
  description:
    "Sign up free in about 30 seconds — email and password, no Google login, no biodata. Answer five honest questions and your first AI match runs this Friday.",
  path: "/register",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        id="ld-breadcrumb-register"
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Create Account", path: "/register" },
        ])}
      />
      {children}
    </>
  );
}
