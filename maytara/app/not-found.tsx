import type { Metadata } from "next";
import Link from "next/link";
import { privateMetadata } from "@/lib/seo";

// A branded 404 that still links into the site. The status code is a real 404
// (Next sets it for this file), which is what keeps dead URLs from lingering
// in the index as thin "soft 404" pages.
export const metadata: Metadata = privateMetadata("Page Not Found");

const LINKS = [
  { href: "/",              label: "Home" },
  { href: "/register",      label: "Create Account" },
  { href: "/compatibility", label: "Compatibility Check" },
  { href: "/philosophy",    label: "Our Philosophy" },
  { href: "/contact",       label: "Report & Contact" },
];

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--bg)" }}>
      <div className="text-3xl mb-5" style={{ color: "var(--saffron)" }}>◆ ✦ ◆</div>
      <h1 className="font-typewriter text-4xl mb-3" style={{ color: "var(--ink)" }}>404</h1>
      <p className="font-typewriter text-lg mb-2" style={{ color: "var(--saffron)" }}>
        THIS PAGE ISN&apos;T HERE.
      </p>
      <p className="text-sm mb-8 max-w-md" style={{ color: "var(--ink-muted)" }}>
        The link is broken or the page has moved. Everything that does exist is one click away.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className="btn-secondary text-sm">{l.label}</Link>
        ))}
      </div>
    </div>
  );
}
