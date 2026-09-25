import Link from "next/link";
import { pageMetadata } from "@/lib/pageMetadata";
import { SITE_URL } from "@/lib/siteUrl";

/** These four pages had no metadata of their own, so every one of them
 * inherited the root layout's title and shipped as another page called
 * "OppIDX" with the board's generic description and no canonical — four
 * indexable URLs competing on identical titles. They stayed on OppIDX when the
 * standalone product split off, so they need their own. Titles describe what
 * each page actually says. */
export const metadata = pageMetadata({
  title: "On love, on joy, on what AI actually is — OppIDX",
  description: "Why matching people here is not a compatibility percentage or an algorithm's output. The thinking behind how OppIDX introduces people.",
  canonical: `${SITE_URL}/match/philosophy`,
});

export default function PhilosophyPage() {
  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>OUR PHILOSOPHY</span>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-16">
        <div className="text-center mb-14">
          <div className="text-4xl mb-5" style={{ color: "var(--saffron)" }}>◆ ✦ ◆</div>
          <h1 className="font-typewriter text-4xl mb-4" style={{ color: "var(--ink)", lineHeight: 1.2 }}>
            ON LOVE.<br />
            <span style={{ color: "var(--saffron)" }}>ON JOY.</span><br />
            ON WHAT AI<br />
            ACTUALLY IS.
          </h1>
        </div>

        <div className="flex flex-col gap-12">
          <section>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--saffron)" }}>◆ ON LOVE</div>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              Love is not a metric. It is not a compatibility percentage. It is not an algorithm&apos;s output.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              It is what happens in the gap — the pause before someone answers a hard question honestly. The moment they say something that surprises you, and you realize you hadn&apos;t expected to be surprised. The ordinary Tuesday when nothing remarkable happens and you&apos;re glad they&apos;re there anyway.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "var(--ink)" }}>
              We can&apos;t manufacture that. Nobody can. What we can do is ask better questions — and put the right people in the same room.
            </p>
          </section>

          <section>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--saffron)" }}>◆ ON JOY</div>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              Joy is what most matchmaking apps accidentally destroy.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              They give you a thousand options. You scroll through them like product listings. Swipe left, swipe right. The abundance is the problem. You can&apos;t be fully present with someone when you know there are nine hundred more just below.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              OppIDX Match gives you one. One match. Every Friday. Not because we couldn&apos;t give you more — but because that scarcity is the point. You can&apos;t half-attend to one person. You have to actually show up.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              Joy comes from presence. Presence requires limits. This is the whole design.
            </p>
          </section>

          <section>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--saffron)" }}>◆ ON PEACE</div>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              Most people using dating apps describe the experience as exhausting. They feel like they&apos;re performing. They feel unseen. They feel like they&apos;re shopping, and also being shopped.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              Peace, in this context, means: you answered the questions honestly. You put yourself in. You wait. You don&apos;t scroll. You don&apos;t curate a profile picture. You don&apos;t write a bio that sounds better than you are. You just answer 5 real questions and trust the process.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "var(--ink)" }}>
              That&apos;s it. That&apos;s the whole thing. The absence of noise is the product.
            </p>
          </section>

          <section>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--saffron)" }}>◆ ON AI</div>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              We want to be honest about what AI can and cannot do here.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              AI can analyse patterns in how people describe themselves. It can notice when two people share unusual combinations of values — not just &quot;honest and ambitious&quot; (everyone says that) but the specific way they describe what they won&apos;t accept, what they&apos;ve learned from past failures, what they want that they&apos;re almost embarrassed to admit.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              AI cannot feel. It cannot want. It cannot know what it&apos;s like to sit across from someone and realise something is happening.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              What it can do — what we&apos;ve built it to do — is get out of the way faster. Read what you wrote. Find the person who wrote something that fits. Send you their contact. Exit.
            </p>
            <p className="text-base leading-relaxed font-serif-india italic text-lg" style={{ color: "var(--saffron)" }}>
              &ldquo;The rest is yours.&rdquo;
            </p>
          </section>

          <section>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--saffron)" }}>◆ WHY WE BUILT THIS</div>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
              Because the people we know — smart, real, self-aware — have given up on apps. Not because they&apos;ve given up on connection. Because the apps make connection feel impossible.
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
              Because the alternatives — matrimony sites, arranged introductions, leaving it to chance — all have their own costs. Some are beautiful. Some are extractive. None of them ask the right questions first.
            </p>
            <p className="text-base leading-relaxed" style={{ color: "var(--ink)" }}>
              We built OppIDX Match because we believe the right questions, asked honestly, in a safe space, with no judgment and no noise, can change who finds each other. We believe that&apos;s worth building.
            </p>
          </section>
        </div>

        <div className="mt-16 text-center">
          <div className="text-2xl mb-6" style={{ color: "var(--saffron)" }}>◆ ✦ ◆</div>
          <Link href="/account/register" className="btn-primary text-base px-8 py-3">◆ Start your interview</Link>
          <div className="mt-4">
            <Link href="/" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>← Back to OppIDX</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
