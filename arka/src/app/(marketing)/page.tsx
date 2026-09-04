import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Dharmachakra } from "@/components/motifs";
import { Showcase } from "@/components/showcase";
import { VIDEO_STYLES, LANGUAGES } from "@/lib/catalog";
import { PLANS } from "@/lib/plans";
import { formatMinor } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { ComingSoon } from "@/components/coming-soon";
import { isComingSoon, launchPromise } from "@/lib/launch";

export const dynamic = "force-dynamic";

/**
 * The product page, built as a sequence of printed plates rather than web
 * sections: each one owns its paper stock, its inks and its own composition.
 * Type is set enormous and allowed to bleed off the edge; the figure breaks the
 * type plane; the press texture (grain, halftone, scan lines, misregistration)
 * sits on top of everything.
 */

const STEPS = [
  {
    n: "01",
    title: "Describe one moment",
    body: "A rooftop in the rain. A cycle race through a gully. Abhimanyu stepping into the Chakravyuha. One line is enough.",
  },
  {
    n: "02",
    title: "Choose the look and the voice",
    body: "Eight hand-tuned anime styles. Write a line of narration and hear it spoken in any of twelve languages.",
  },
  {
    n: "03",
    title: "Post it",
    body: "A vertical clip, animated on twos like real cel animation, ready for Reels and Shorts.",
  },
] as const;

const FAQ = [
  {
    q: "Why does this look like anime and not like AI?",
    a: "Because we do the thing the models do not. Real anime is limited animation — held frames, roughly twelve drawings a second, not thirty. Raw AI video is smooth, and that smoothness is exactly what makes it read as 3D. Every Arka render is stepped back onto twos or threes to match the cadence of the style you picked.",
  },
  {
    q: "Do I own what I generate?",
    a: "Yes. Anything you pay credits for is yours, with full commercial rights.",
  },
  {
    q: "Why credits instead of an unlimited plan?",
    a: "Because every render costs us real money at the model provider. An 'unlimited' plan always has a hidden fair-use limit somewhere. Credits are the honest version of the same thing — you see exactly what a clip costs before you make it.",
  },
  {
    q: "What if a render fails?",
    a: "Your credits come straight back, automatically. You are never charged for a video you did not receive.",
  },
  {
    q: "Can I pay in rupees?",
    a: "Yes — UPI, Indian cards and netbanking, priced in rupees. Outside India you are billed in dollars.",
  },
] as const;

export default async function LandingPage() {
  /**
   * Closed until told otherwise.
   *
   * Returned before any of the product page renders, so nothing below it can
   * advertise a generator that has no model behind it or a checkout that
   * cannot take money.
   */
  if (isComingSoon()) return <ComingSoon promise={launchPromise()} />;

  const settings = await getSettings();
  const starter = PLANS.find((plan) => plan.code === "starter")!;
  const perSecond = settings["credits.previewPerSecond"];

  return (
    <>
      {/* ── PLATE 01 — the hero ──────────────────────────────────────────── */}
      <section id="plate-01" className="grain scanlines relative overflow-hidden border-b-2 border-vermilion/40">
        <div
          aria-hidden
          className="bg-grid-plate pointer-events-none absolute inset-0 text-foreground/[0.07]"
        />

        {/* The ghost plate: the wordmark set bigger than the page and running
            off both edges, with the headline printed over it. Overlap is the
            point — but it has to sit behind the whole headline band, not clip
            its top edge, or it reads as a collision rather than a plate. */}
        <div
          aria-hidden
          className="poster misreg ghost-plate pointer-events-none absolute inset-x-0 top-[14%] z-0 text-center text-[clamp(5rem,30vw,18rem)] whitespace-nowrap select-none"
        >
          अर्क ARKA अर्क
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-rise">
              <p className="annotation mb-6 inline-flex items-center gap-2 border border-cyan/50 px-3 py-1.5 text-cyan">
                <span className="size-1.5 animate-flicker bg-cyan" />
                Plate 01 · Made in India
              </p>

              <h1 className="poster text-[clamp(2.9rem,10.5vw,7.5rem)] leading-[0.8]">
                <span className="block">Your stories,</span>
                <span className="block text-vermilion">drawn like</span>
                <span className="outline-type block text-cyan">anime.</span>
              </h1>

              <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
                Arka turns one line of text into a short anime film. Twelve Indian
                languages, narrated, vertical, priced in rupees.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink href="/sign-up" size="xl" className="rounded-none">
                  Make your first clip
                  <ArrowRight className="size-4" />
                </ButtonLink>
                <ButtonLink
                  href="/pricing"
                  variant="outline"
                  size="xl"
                  className="rounded-none border-cyan/60 text-cyan"
                >
                  Pricing
                </ButtonLink>
              </div>

              <p className="annotation mt-6 text-muted-foreground">
                Credits from ₹299 · No subscription required
              </p>
            </div>

            {/* The figure that breaks the type plane. */}
            <div className="relative mx-auto w-full max-w-[380px]">
              <Dharmachakra duotone className="halftone relative w-full text-ink" />

              <div className="annotation absolute -left-2 top-4 hidden text-cyan lg:block">
                <span className="block border-l border-cyan pl-2">8 spokes</span>
              </div>
              <div className="annotation absolute -right-2 bottom-8 hidden text-vermilion lg:block">
                <span className="block border-r border-vermilion pr-2 text-right">
                  on twos
                </span>
              </div>
            </div>
          </div>

          {/* Verse block, the way a plate carries its source text. */}
          <div className="mt-16 grid gap-6 border-t border-border pt-8 md:grid-cols-[1fr_auto]">
            <p lang="hi" className="max-w-lg text-lg leading-relaxed text-vermilion/90">
              कर्मण्येवाधिकारस्ते मा फलेषु कदाचन
            </p>
            <p className="annotation self-end text-muted-foreground">
              You have the right to action, not the result
            </p>
          </div>
        </div>
      </section>

      {/* ── PLATE 02 — the thesis, on bone stock ─────────────────────────── */}
      <section id="plate-02" className="stock-bone grain halftone relative overflow-hidden text-ink">
        <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
          <p className="annotation mb-8 text-vermilion">Plate 02 · Why it reads as drawn</p>

          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className="poster text-[3.5rem] leading-[0.85] sm:text-[5rem]">
                Anime is not
                <span className="block text-vermilion">smooth.</span>
                That is the
                <span className="block">whole point.</span>
              </h2>
            </div>

            <div className="space-y-6 self-end font-mono text-sm leading-relaxed">
              <p>
                Most AI video runs at thirty frames a second, and that fluidity is
                precisely why it looks like a game cinematic instead of a film.
              </p>
              <p>
                Studio animation holds each drawing for two or three frames —
                roughly twelve a second. Arka steps every render back onto that
                cadence, so motion lands the way it does in a cel.
              </p>
              <p className="border-l-2 border-vermilion pl-4 text-vermilion">
                Held frames · inked linework · flat shading · no interpolation
              </p>
            </div>
          </div>

          {/* The cadence table, set like a spec sheet. */}
          <dl className="mt-16 grid grid-cols-2 gap-px border border-ink/20 bg-ink/20 sm:grid-cols-4">
            {[
              { k: "On twos", v: "12", d: "Shonen, Pastoral, Cinematic, Noir, Chibi" },
              { k: "On threes", v: "8", d: "Mythic Epic, Retro 90s" },
              { k: "On sixes", v: "6", d: "Manga Ink" },
              { k: "Output", v: "24", d: "Frames per second, held" },
            ].map((row) => (
              <div key={row.k} className="bg-bone p-5">
                <dt className="annotation text-ink/60">{row.k}</dt>
                <dd className="poster mt-2 text-6xl text-vermilion">{row.v}</dd>
                <dd className="mt-2 font-mono text-[11px] leading-snug text-ink/60">
                  {row.d}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The demonstrations. Renders nothing until clips are published. ── */}
      <Showcase />

      {/* ── PLATE 03 — the styles ────────────────────────────────────────── */}
      <section id="plate-03" className="grain relative overflow-hidden border-y-2 border-vermilion/40">
        <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <h2 className="poster text-[3.5rem] sm:text-[5rem]">
              Eight <span className="text-cyan">looks</span>
            </h2>
            <p className="annotation max-w-xs text-muted-foreground">
              Each carries its own palette, lighting and cadence
            </p>
          </div>

          <div className="masonry border-t border-l border-border">
            {VIDEO_STYLES.map((style, index) => (
              <article
                key={style.id}
                className="halftone group relative border-r border-b border-border"
              >
                <div
                  className="relative overflow-hidden"
                  style={{
                    height: [260, 340, 300, 380][index % 4],
                    background: `linear-gradient(165deg, ${style.accent} 0%, transparent 72%)`,
                  }}
                >
                  <div
                    aria-hidden
                    className="bg-kolam absolute inset-0 text-ink"
                  />
                  <span className="poster absolute -bottom-3 left-3 text-[5rem] text-ink/25">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <div className="relative bg-card p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="poster text-3xl">{style.label}</h3>
                    <span className="annotation text-cyan">
                      {style.drawingsPerSecond}fps
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
                    {style.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATE 04 — the languages ─────────────────────────────────────── */}
      <section id="plate-04" className="grain scanlines relative overflow-hidden bg-vermilion text-ink">
        <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
          <p className="annotation mb-8 text-ink/70">Plate 04 · Twelve languages</p>

          <h2 className="poster max-w-3xl text-[3rem] leading-[0.85] sm:text-[4.5rem]">
            In the language your audience actually thinks in
          </h2>

          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3">
            {LANGUAGES.map((language) => (
              <span
                key={language.id}
                lang={language.id}
                className="text-3xl leading-tight text-ink/90 transition-opacity hover:opacity-60 sm:text-4xl"
              >
                {language.native}
              </span>
            ))}
          </div>

          <p className="annotation mt-10 max-w-md text-ink/70">
            Narration is synthesised per language, not subtitled after the fact
          </p>
        </div>
      </section>

      {/* ── PLATE 05 — how it works ──────────────────────────────────────── */}
      <section className="grain relative overflow-hidden">
        <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
          <ol className="grid gap-px border border-border bg-border md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="bg-background p-8">
                <span className="poster block text-[4rem] text-vermilion">{step.n}</span>
                <h3 className="poster mt-4 text-2xl">{step.title}</h3>
                <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── PLATE 06 — pricing, as a spec sheet ──────────────────────────── */}
      <section id="plate-06" className="stock-bone grain relative overflow-hidden text-ink">
        <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="annotation mb-6 text-vermilion">Plate 06 · Pricing</p>
              <h2 className="poster text-[3.5rem] leading-[0.85] sm:text-[5rem]">
                Credits,
                <span className="block text-vermilion">not promises.</span>
              </h2>
            </div>
            <ButtonLink
              href="/pricing"
              variant="outline"
              size="lg"
              className="rounded-none border-ink/40 text-ink"
            >
              Full pricing
            </ButtonLink>
          </div>

          <div className="mt-12 grid gap-px border border-ink/20 bg-ink/20 sm:grid-cols-3">
            <div className="bg-bone p-6">
              <p className="annotation text-ink/60">Starts at</p>
              <p className="poster mt-2 text-6xl">
                {formatMinor(starter.priceMinorInr, "INR")}
              </p>
              <p className="mt-2 font-mono text-xs text-ink/60">
                per month · {starter.monthlyCredits} credits
              </p>
            </div>
            <div className="bg-bone p-6">
              <p className="annotation text-ink/60">A second of video</p>
              <p className="poster mt-2 text-6xl text-vermilion">{perSecond}</p>
              <p className="mt-2 font-mono text-xs text-ink/60">
                credits · shown before you generate
              </p>
            </div>
            <div className="bg-bone p-6">
              <p className="annotation text-ink/60">A failed render</p>
              <p className="poster mt-2 text-6xl">0</p>
              <p className="mt-2 font-mono text-xs text-ink/60">
                refunded in full, automatically
              </p>
            </div>
          </div>

          <p className="mt-6 max-w-xl font-mono text-xs leading-relaxed text-ink/60">
            There is no unlimited tier. Every render costs us real money at the
            model provider, and a plan that pretends otherwise is hiding a
            fair-use clause somewhere.
          </p>
        </div>
      </section>

      {/* ── PLATE 07 — questions ─────────────────────────────────────────── */}
      <section className="grain relative overflow-hidden border-t-2 border-vermilion/40">
        <div className="relative z-[2] mx-auto max-w-3xl px-5 py-24">
          <h2 className="poster text-[3rem] sm:text-[4rem]">Questions</h2>

          <dl className="mt-12 divide-y divide-border border-y border-border">
            {FAQ.map((item) => (
              <div key={item.q} className="grid gap-3 py-7 md:grid-cols-[1fr_1.4fr] md:gap-8">
                <dt className="poster text-2xl text-balance">{item.q}</dt>
                <dd className="font-mono text-xs leading-relaxed text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── PLATE 08 — the close ─────────────────────────────────────────── */}
      <section className="grain scanlines relative overflow-hidden">
        <div
          aria-hidden
          className="poster misreg ghost-plate pointer-events-none absolute inset-x-0 top-1/4 text-center text-[22vw] whitespace-nowrap select-none"
        >
          ARKA अर्क ARKA
        </div>

        <div className="relative z-[2] mx-auto max-w-3xl px-5 py-28 text-center">
          <Dharmachakra duotone className="mx-auto mb-10 w-24" />

          <h2 className="poster text-[3.5rem] leading-[0.85] sm:text-[5.5rem]">
            Make the first one
            <span className="block text-vermilion">tonight.</span>
          </h2>

          <p className="mx-auto mt-6 max-w-sm font-mono text-sm text-muted-foreground">
            The first few clips are on us. If it is not useful, you have lost ten
            minutes.
          </p>

          <div className="mt-10 flex justify-center">
            <ButtonLink href="/sign-up" size="xl" className="rounded-none">
              Create your account
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>

          <p className="annotation mt-8 text-muted-foreground">
            Already have one?{" "}
            <Link href="/sign-in" className="text-cyan underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
