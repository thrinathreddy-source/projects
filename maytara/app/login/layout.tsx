import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Log In",
  description:
    "Log in to The Mayatara to see this Friday's match, your answers and your contact reveal. Email and password only — we never used a Google login.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
