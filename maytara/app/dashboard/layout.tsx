import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

// Signed-in / single-use surface: crawlable so Google can read the noindex,
// but never indexed. See the note in app/robots.ts.
export const metadata: Metadata = privateMetadata("Dashboard");

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
