import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { parseJsonArray } from "@/lib/safeJson";
import { ShareBar } from "@/components/ui/ShareBar";
import { SITE_URL } from "@/lib/siteUrl";
import { pageMetadata } from "@/lib/pageMetadata";
import { DigestBody } from "./DigestBody";
import type { DigestItem } from "@/lib/policyDigest/generate";

async function getDigest(period: string) {
  const digest = await prisma.policyDigest.findUnique({ where: { period } });
  if (!digest) return null;
  // A malformed snapshot renders an empty digest rather than 500ing the page.
  return { ...digest, items: parseJsonArray<DigestItem>(digest.items, `PolicyDigest.items ${period}`) };
}

function periodLabel(period: string, periodType: string): string {
  if (periodType === "weekly") return `Week ${period}`;
  const d = new Date(`${period}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export async function generateMetadata({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const digest = await getDigest(period);
  if (!digest) return { title: "Page not found — OppIDX" };
  return pageMetadata({
    title: `Policy digest — ${periodLabel(period, digest.periodType)} — OppIDX`,
    description: digest.summary,
    canonical: `${SITE_URL}/pulse/digest/${period}`,
    image: 'route', // app/pulse/digest/[period]/opengraph-image.tsx
  });
}

export default async function DigestPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const digest = await getDigest(period);
  if (!digest) notFound();

  const pageUrl = `${SITE_URL}/pulse/digest/${period}`;

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-y-2">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>
            {digest.periodType === "weekly" ? "WEEKLY DIGEST" : "DAILY DIGEST"}
          </span>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-14 relative z-10">
        <div className="mb-6">
          <Link href="/pulse" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>← Back to Pulse</Link>
        </div>

        <div className="text-center mb-10">
          <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◈</div>
          <h1 className="font-typewriter text-2xl md:text-3xl mb-3" style={{ color: "var(--ink)" }}>
            {periodLabel(period, digest.periodType).toUpperCase()}
          </h1>
          <p className="text-sm leading-relaxed max-w-xl mx-auto mb-2" style={{ color: "var(--ink-muted)" }}>
            {digest.summary}
          </p>
          <p className="text-xs leading-relaxed max-w-xl mx-auto mb-6" style={{ color: "var(--ink-muted)", opacity: 0.75 }}>
            That paragraph is AI-written, generated only from the real headlines below — it never adds a name, number, or event that isn&apos;t in them. Every individual item still links straight to its original government or regulatory source, itself untouched.
          </p>
          <div className="flex justify-center">
            <ShareBar title={`Policy digest — ${periodLabel(period, digest.periodType)}`} url={pageUrl} />
          </div>
        </div>

        <DigestBody items={digest.items} />

        <p className="text-xs text-center mt-10 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          Sourced from official government and regulatory feeds — India&apos;s PIB/RBI/SEBI, the U.S.&apos;s Federal Register/SEC, and the UK&apos;s GOV.UK/FCA/Bank of England — generated automatically, nothing hand-picked.
          <br />
          <Link href="/pulse" style={{ color: "var(--saffron)" }}>See today&apos;s live Pulse →</Link>
        </p>
      </div>
    </div>
  );
}
