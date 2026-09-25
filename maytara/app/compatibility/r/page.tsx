import type { Metadata } from "next";
import Link from "next/link";
import { parseSharedResult, headline, subhead, shareImageUrl } from "@/lib/shareResult";
import { SITE_NAME } from "@/lib/seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A shared compatibility result.
 *
 * Server-rendered, so a link posted into WhatsApp or a group chat unfurls with
 * the score in the preview instead of a bare URL — and whoever taps it lands
 * on a real page rather than an empty form.
 *
 * Deliberately noindex: the same template with a different `s=` is not a new
 * page, and letting a crawler discover thousands of them is how a small site
 * buries its seven real ones. `follow` is kept so the links out to
 * /compatibility and /register still count. No canonical either — pointing one
 * at /compatibility while also saying noindex is two contradictory
 * instructions, and Google resolves that however it likes.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const result = parseSharedResult(await searchParams);

  if (!result) {
    return {
      title: "Compatibility Result",
      description: "Run a free AI compatibility check on The Mayatara.",
      alternates: null,
      robots: { index: false, follow: true },
    };
  }

  const title = `${headline(result)} — ${subhead(result)}`;
  const description =
    result.type === "global"
      ? `Scored in the top ${100 - (result.percentile ?? 0)}% of the pool on The Mayatara's free AI fit check. Run yours — no account needed.`
      : `Scored ${result.score}/100 on The Mayatara's free AI compatibility check${result.verdict ? ` — ${result.verdict.toLowerCase()}` : ""}. Run yours — no account needed.`;
  const image = shareImageUrl(result);

  return {
    title,
    description,
    alternates: null,
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: `${headline(result)} on The Mayatara` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function SharedResultPage({ searchParams }: Props) {
  const result = parseSharedResult(await searchParams);

  const scoreColor = !result
    ? "var(--ink)"
    : result.type === "global"
      ? "var(--saffron)"
      : (result.score ?? 0) >= 80 ? "var(--green)" : (result.score ?? 0) >= 60 ? "var(--saffron)" : "var(--maroon)";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>SHARED RESULT</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-16 text-center">
        {result ? (
          <>
            <div className="text-3xl mb-6" style={{ color: "var(--saffron)" }}>◆ ✦ ◆</div>

            <div className="card p-10 mb-8" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
              <p className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--ink-muted)" }}>
                {result.lookingFor ? `${result.lookingFor.toUpperCase()} CHECK` : "COMPATIBILITY CHECK"}
              </p>
              <p className="font-typewriter mb-2" style={{ color: scoreColor, fontSize: "clamp(3rem, 14vw, 5.5rem)", lineHeight: 1 }}>
                {headline(result)}
              </p>
              {result.verdict ? (
                <p className="font-typewriter text-lg tracking-wide mt-4" style={{ color: "var(--saffron)" }}>
                  {result.verdict}
                </p>
              ) : null}
            </div>

            <h1 className="font-typewriter text-2xl mb-4" style={{ color: "var(--ink)" }}>
              SOMEONE RAN THIS ON THE MAYATARA.
            </h1>
            <p className="text-base leading-relaxed mb-2" style={{ color: "var(--ink-muted)" }}>
              Our AI scores two people on personality, values, lifestyle, communication style and goals —
              then explains the strengths, the watchpoints, and where to start the conversation.
            </p>
            <p className="text-sm leading-relaxed mb-10" style={{ color: "var(--ink-muted)" }}>
              Free, no account needed. This page shows the score only — never the answers or the names behind it.
            </p>
          </>
        ) : (
          <>
            <div className="text-3xl mb-6" style={{ color: "var(--saffron)" }}>◆</div>
            <h1 className="font-typewriter text-2xl mb-4" style={{ color: "var(--ink)" }}>
              THIS RESULT LINK IS INCOMPLETE.
            </h1>
            <p className="text-base leading-relaxed mb-10" style={{ color: "var(--ink-muted)" }}>
              Whatever was shared didn&apos;t survive the trip. You can run the check yourself in about a minute —
              it&apos;s free and needs no account.
            </p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/compatibility" className="btn-primary text-base px-8 py-3">✦ &nbsp; Run Your Own Check</Link>
          <Link href="/register" className="btn-secondary text-base px-8 py-3">◆ &nbsp; One Match Every Friday</Link>
        </div>

        <p className="text-xs mt-10" style={{ color: "var(--ink-muted)" }}>
          <Link href="/" style={{ color: "var(--saffron)" }}>The Mayatara</Link>
          {" · "}
          <Link href="/philosophy" style={{ color: "var(--ink-muted)" }}>Our philosophy</Link>
          {" · "}
          <Link href="/terms" style={{ color: "var(--ink-muted)" }}>Terms &amp; privacy</Link>
        </p>
      </main>
    </div>
  );
}
