"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ApsaraDancer, LoveCouple, LotusBlossom } from "./components/SculptureAnim";
import JsonLd from "./components/JsonLd";
import { supabase } from "@/lib/supabase";
import { faqSchema } from "@/lib/seo";
import { useNextFriday } from "@/lib/useNextFriday";

// Answers to what people actually type into Google before they trust a new
// matching site. Rendered visibly below — FAQ structured data may only ever
// describe text the visitor can read on the same page.
const FAQS = [
  {
    q: "Is The Mayatara free?",
    a: "Yes. Creating an account, answering the questions and getting your Friday match are free, with no subscription and nothing to pay to see or message a match.",
  },
  {
    q: "How does the Friday match work?",
    a: "Every Friday night our AI runs through the whole pool and picks the single best match for each person. If we find yours, their contact is waiting on your dashboard. If we don't, we tell you that instead of leaving you guessing.",
  },
  {
    q: "What can I look for on The Mayatara?",
    a: "Dating, friendship, a co-founder, marriage, or still figuring it out. You choose when you sign up, and we only match you inside what you asked for.",
  },
  {
    q: "Do I have to swipe or chat inside an app?",
    a: "No. There is no feed, no swiping and no inbox. You get one match and their contact — phone, WhatsApp, Instagram or whatever they chose to share — and the conversation happens wherever you already talk to people.",
  },
  {
    q: "How does the AI decide who I match with?",
    a: "It reads the five honest questions you answered — who you are, what you need and what you won't put up with — rather than photos or biodata. Where we can, we prioritise people who already share your world: same campus, same company, same city.",
  },
  {
    q: "Is my data private?",
    a: "There is no Google login, so we never see your browsing history. Contact details are encrypted at rest with AES-256 and are only revealed once a match is confirmed. We don't host your chats, so we're not in the room afterwards.",
  },
  {
    q: "Who can join?",
    a: "Anyone 18 or over. The pool is built around India, and you can ask to be matched in your own city only, anywhere in India, or long distance.",
  },
  {
    q: "How is this different from a dating app or a matrimony site?",
    a: "Dating apps are built on infinite scroll and need you to stay single. Matrimony sites turn you into a listing of caste, salary and skin tone. The Mayatara gives you one match a week, tells you why, hands over the contact and steps back.",
  },
  {
    q: "What is the compatibility check?",
    a: "A free tool that scores any two people on personality, values, lifestyle, communication style and goals, and explains the strengths, the watchpoints and where to start the conversation. No account needed.",
  },
  {
    q: "How do I delete my account or my data?",
    a: "Ask on the Report & Contact page. The same channel handles safety reports, grievances, and correcting or exporting your data, and a person reads everything that arrives there.",
  },
];

const TYPES = [
  { label: "Dating",              desc: "Meet someone real." },
  { label: "Friendship",          desc: "Find your person." },
  { label: "Co-founder",          desc: "Build together." },
  { label: "Wedding",            desc: "For keeps." },
  { label: "Still Figuring Out",  desc: "Start honest." },
];
const DECO = ["◆", "✦", "❋", "◈", "✧", "❋", "◆", "✦"];

export default function Home() {
  const [userName, setUserName] = useState<string | null>(null);
  const countdown = useNextFriday();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from("users").select("name").eq("id", session.user.id).single()
          .then(({ data }) => { if (data) setUserName(data.name); });
      }
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <JsonLd id="ld-faq" data={faqSchema(FAQS)} />

      <div className="w-full text-center py-1 text-xs tracking-widest font-typewriter"
        style={{ background: "var(--maroon)", color: "#FAF0D7" }}>
        ◆ &nbsp; FOR THE REAL ONES &nbsp; ◆ &nbsp; FIND THE REAL ONE &nbsp; ◆ &nbsp; EVERY FRIDAY &nbsp; ◆
      </div>

      <header className="relative z-10 border-b-2" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {/* Stacked below md. Side by side, the brand block shrinks past the
            width of its own title — and "THE MAYATARA" is one unbreakable run
            at this size, so it overflowed its box and rendered underneath the
            nav buttons. Giving each row the full width removes the contest. */}
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            {/* Above the fold on every viewport, so it is the LCP candidate:
                `priority` preloads it instead of letting it queue behind the
                rest of the page. */}
            <Image src="/logo.png" alt="The Mayatara logo" width={88} height={88} priority
              sizes="(min-width: 768px) 88px, 64px"
              className="w-16 h-16 md:w-[88px] md:h-[88px] shrink-0" style={{ objectFit: "contain" }} />
            <div className="min-w-0">
              {/* Site name, not the page's subject — the <h1> belongs to the
                  hero heading below, and two of them dilute both. */}
              <p className="font-typewriter text-xl sm:text-2xl tracking-wider" style={{ color: "var(--saffron)", lineHeight: 1 }}>THE MAYATARA</p>
              <p className="text-xs tracking-widest" style={{ color: "var(--ink-muted)" }}>FIND YOUR PERSON</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center md:justify-end">
            {userName ? (
              <>
                <span className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>Welcome back, {userName}</span>
                <Link href="/dashboard" className="btn-primary text-sm">◆ My Dashboard</Link>
              </>
            ) : (
              <>
                <Link href="/register" className="btn-primary text-sm">Create Account</Link>
                <Link href="/login" className="btn-secondary text-sm">Log In</Link>
              </>
            )}
            <Link href="/compatibility" className="btn-secondary text-sm">Compatibility Check</Link>
          </nav>
        </div>
      </header>

      <div className="w-full py-2 flex items-center justify-center gap-8 text-base"
        style={{ borderBottom: "1px solid var(--border)", color: "var(--border)" }}>
        {DECO.map((s, i) => <span key={i}>{s}</span>)}
      </div>

      <main className="flex-1 relative z-10">

        {/* HERO */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center relative overflow-hidden">

          {/* Apsara left */}
          <div className="absolute left-0 top-8 pointer-events-none select-none hidden md:block" style={{ opacity: 0.13 }}>
            <ApsaraDancer style={{ height: "280px", color: "var(--saffron)" }} />
          </div>
          {/* Lotus right */}
          <div className="absolute right-4 bottom-4 pointer-events-none select-none hidden md:block" style={{ opacity: 0.12 }}>
            <LotusBlossom style={{ height: "100px", color: "var(--border)" }} />
          </div>

          {/* Badge */}
          <div className="inline-block mb-6 px-4 py-1 font-typewriter text-xs tracking-widest stamp-border"
            style={{ color: "var(--maroon)", borderColor: "var(--maroon)", boxShadow: "3px 3px 0 var(--maroon)" }}>
            BY THE YOUTH, FOR THE YOUTH
          </div>

          {/* Hero heading — the page's one <h1>. The sr-only line spells the
              subject out for crawlers and screen readers, since "REAL. MESSY.
              YOURS." says nothing about what this site does. */}
          <h1 className="font-typewriter text-5xl md:text-7xl leading-tight mb-4 cursor-blink"
            style={{ color: "var(--ink)" }}>
            REAL.<br />
            <span style={{ color: "var(--saffron)" }}>MESSY.</span><br />
            YOURS.
            <span className="sr-only">
              {" "}The Mayatara — free AI matchmaking in India. One match every Friday, for dating,
              friendship, a co-founder or marriage.
            </span>
          </h1>

          {/* Friday line */}
          <p className="font-typewriter text-3xl md:text-5xl mb-6 tracking-wide leading-tight"
            style={{ color: "var(--maroon)", textShadow: "2px 2px 0 rgba(139,26,26,0.15)" }}>
            FIND YOUR PERSON.<br />
            <span style={{ color: "var(--saffron)" }}>EVERY FRIDAY.</span>
          </p>

          {/* Countdown */}
          <div className="inline-flex flex-col items-center mb-8 px-6 py-3"
            style={{ border: "2px solid var(--saffron)", background: "var(--card)", boxShadow: "3px 3px 0 var(--saffron)" }}>
            <span className="text-xs font-typewriter tracking-widest mb-1" style={{ color: "var(--ink-muted)" }}>
              NEXT MATCH DROPS IN
            </span>
            <span className="font-typewriter text-2xl md:text-3xl tracking-wider" style={{ color: "var(--saffron)" }}>
              {countdown || "—"}
            </span>
          </div>

          {/* The box — untouched */}
          <div className="card max-w-2xl mx-auto p-6 mb-8"
            style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
            <p className="font-typewriter text-lg md:text-xl leading-relaxed" style={{ color: "var(--ink)" }}>
              Answer 5 honest questions.<br />
              We find your person.<br />
              You get their contact.
            </p>
            <p className="text-sm mt-3" style={{ color: "var(--ink-muted)" }}>
              Dating · Friendship · Co-founder · Wedding · Or just figuring it out.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Link href="/register" className="btn-primary text-base px-8 py-3">◆ &nbsp; Create Account — It&apos;s Free</Link>
            <Link href="/compatibility" className="btn-secondary text-base px-8 py-3">✦ &nbsp; Check Compatibility</Link>
          </div>

          {/* Friday explanation — no negativity */}
          <div className="max-w-xl mx-auto p-5 text-left"
            style={{ background: "var(--bg-dark)", border: "1px solid var(--border)" }}>
            <p className="font-typewriter text-xs tracking-widest mb-2" style={{ color: "var(--saffron)" }}>
              ◆ HOW FRIDAY WORKS
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              Every Friday night, our AI runs through the full pool and finds the single best match
              for each person. One match. Chosen by the AI.
            </p>
          </div>

        </section>

        {/* INSTITUTION MATCHING BANNER */}
        <section className="py-10" style={{ background: "var(--card)", borderTop: "2px solid var(--saffron)", borderBottom: "2px solid var(--saffron)" }}>
          <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="font-typewriter text-xs tracking-widest mb-2" style={{ color: "var(--saffron)" }}>◆ MATCHED WITHIN YOUR WORLD</div>
              <h2 className="font-typewriter text-xl md:text-2xl tracking-wide" style={{ color: "var(--ink)" }}>
                WE MATCH WITHIN YOUR INSTITUTION.
              </h2>
              <p className="text-sm mt-2 max-w-lg" style={{ color: "var(--ink-muted)" }}>
                IIT to IIT. BITS to BITS. Ashoka to Ashoka. Microsoft to Microsoft. If your college or workplace is in our pool, we prioritise matches who already share your world — same campus, same company, same city.
              </p>
            </div>
            <div className="flex-shrink-0 text-center px-8 py-5 font-typewriter"
              style={{ border: "2px solid var(--saffron)", boxShadow: "4px 4px 0 var(--saffron)", background: "var(--bg)" }}>
              <div className="text-3xl mb-1" style={{ color: "var(--saffron)" }}>◆</div>
              <div className="text-xs tracking-widest" style={{ color: "var(--ink-muted)" }}>SHARED CONTEXT.</div>
              <div className="text-xs tracking-widest" style={{ color: "var(--ink-muted)" }}>REAL CHEMISTRY.</div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — 4 steps, no jargon */}
        <section className="py-16" style={{ background: "var(--bg-dark)", borderTop: "2px solid var(--border)", borderBottom: "2px solid var(--border)" }}>
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="gem-divider mb-10 text-sm">◆ HOW IT WORKS ◆</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { n: "01", title: "CREATE ACCOUNT", desc: "Email and password. No Google. No tracking. 30 seconds." },
                { n: "02", title: "ANSWER 5 QUESTIONS", desc: "Real questions. Who you are. What you need. What you won't put up with." },
                { n: "03", title: "EVERY FRIDAY NIGHT", desc: "Matches run once a week — Friday nights. If we find your person, their contact is waiting on your dashboard. If we don't, we say that too. No silence, no chasing you." },
                { n: "04", title: "YOU GET THEIR CONTACT", desc: "Phone, Instagram, WhatsApp — whatever they chose to share. We step back. You take it from here." },
              ].map(s => (
                <div key={s.n} className="card p-5 relative">
                  <div className="absolute -top-3 -left-1 font-typewriter text-4xl font-bold opacity-10"
                    style={{ color: "var(--saffron)" }}>{s.n}</div>
                  <h3 className="font-typewriter text-xs tracking-wide mb-2 mt-3" style={{ color: "var(--saffron)" }}>{s.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHAT YOU'RE LOOKING FOR */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <h2 className="gem-divider mb-10 text-sm">◆ WHAT ARE YOU LOOKING FOR ◆</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {TYPES.map((t, i) => (
              <Link key={t.label} href={`/register`}
                className="p-5 text-center transition-all"
                style={{
                  background: "var(--card)",
                  border: `2px solid ${i === 0 ? "var(--saffron)" : "var(--border)"}`,
                  boxShadow: i === 0 ? "3px 3px 0 var(--saffron)" : "3px 3px 0 var(--border)",
                  textDecoration: "none",
                } as React.CSSProperties}>
                <div className="font-typewriter text-sm mb-1" style={{ color: i === 0 ? "var(--saffron)" : "var(--ink)" }}>
                  {t.label}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{t.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* PRIVACY — the differentiator */}
        <section className="py-14" style={{ background: "var(--bg-dark)", borderTop: "2px solid var(--border)", borderBottom: "2px solid var(--border)" }}>
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="gem-divider mb-10 text-sm">◆ PRIVACY IS NOT A FEATURE. IT&apos;S THE POINT. ◆</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { sym: "◆", title: "NO GOOGLE LOGIN", desc: "We don't know your browsing history. We don't want to. Email and password only." },
                { sym: "✦", title: "ENCRYPTED CONTACTS", desc: "Your phone number is encrypted with AES-256. We literally cannot read it — until your match is confirmed." },
                { sym: "❋", title: "WE DON'T HOST CHATS", desc: "Once you have their number, the conversation is yours. We're not in the room." },
              ].map(p => (
                <div key={p.title} className="card p-5">
                  <div className="text-2xl mb-3" style={{ color: "var(--saffron)" }}>{p.sym}</div>
                  <h3 className="font-typewriter text-xs tracking-wide mb-2" style={{ color: "var(--ink)" }}>{p.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* NOT TINDER. NOT SHAADI. */}
        <section className="py-16 relative overflow-hidden" style={{ background: "var(--bg-dark)", borderTop: "2px solid var(--border)", borderBottom: "2px solid var(--border)" }}>
          {/* Decorative Apsara — ghost watermark right edge */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none select-none pr-2 hidden lg:flex" style={{ opacity: 0.08 }}>
            <ApsaraDancer style={{ height: "340px", color: "var(--saffron)" }} />
          </div>
          <div className="max-w-4xl mx-auto px-6 relative z-10">
            <h2 className="gem-divider mb-10 text-sm">◆ WHAT MAKES US DIFFERENT ◆</h2>
            <div className="text-center mb-10">
              <h3 className="font-typewriter text-2xl md:text-3xl tracking-wide" style={{ color: "var(--ink)" }}>
                WE ARE NOT TINDER.<br />
                WE ARE NOT BUMBLE.<br />
                WE ARE NOT A MATRIMONY APP.
              </h3>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  label: "TINDER / BUMBLE",
                  sym: "✗", symColor: "var(--maroon)", headerColor: "var(--maroon)",
                  points: [
                    "Infinite scroll. Infinite options.",
                    "You swipe 300 people a week.",
                    "Ghosting is the default.",
                    "The app needs you to stay single.",
                    "Designed for dopamine, not decisions.",
                  ],
                },
                {
                  label: "MATRIMONY APPS",
                  sym: "✗", symColor: "var(--ink-muted)", headerColor: "var(--ink-muted)",
                  points: [
                    "Biodata disguised as a profile.",
                    "Caste, salary, skin tone first.",
                    "Your parents do the matching.",
                    "Pay ₹5000 to message someone.",
                    "You're a listing, not a person.",
                  ],
                },
                {
                  label: "THE MAYATARA",
                  sym: "✓", symColor: "var(--green)", headerColor: "var(--saffron)",
                  highlight: true,
                  points: [
                    "One match. Every Friday. That's it.",
                    "We interview you. You're not a form.",
                    "Our AI matches on who you actually are.",
                    "Free. No subscription. No biodata.",
                    "We give you the contact. We leave.",
                  ],
                },
              ].map((col) => (
                <div key={col.label} className="card p-6"
                  style={{
                    borderColor: col.highlight ? "var(--saffron)" : "var(--border)",
                    boxShadow: col.highlight ? "5px 5px 0 var(--saffron)" : "5px 5px 0 var(--border)",
                  }}>
                  <div className="font-typewriter text-xs tracking-widest mb-5 pb-3"
                    style={{ color: col.headerColor, borderBottom: "1px solid var(--border)" }}>
                    {col.label}
                  </div>
                  <ul className="flex flex-col gap-3">
                    {col.points.map((p, i) => (
                      <li key={i} className="text-sm flex gap-2" style={{ color: "var(--ink)" }}>
                        <span style={{ color: col.symColor, flexShrink: 0, fontWeight: "bold" }}>{col.sym}</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sculpture interlude */}
        <div className="flex items-center justify-center gap-12 py-8" style={{ opacity: 0.35 }}>
          <LotusBlossom style={{ height: "56px", color: "var(--border)" }} />
          <LoveCouple style={{ height: "120px", color: "var(--saffron)" }} />
          <LotusBlossom style={{ height: "56px", color: "var(--border)" }} />
        </div>

        {/* THE HONEST SECTION */}
        <section className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-3xl mb-6" style={{ color: "var(--saffron)" }}>◆</div>
          <h2 className="font-typewriter text-2xl mb-5" style={{ color: "var(--ink)" }}>
            WE&apos;RE NOT CODING LOVE.<br />
            WE&apos;RE JUST ASKING BETTER QUESTIONS.
          </h2>
          <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
            Every other app gives you a thousand profiles to scroll through.
            You get tired. You get cynical. You stop believing anyone real is on there.
          </p>
          <p className="text-base leading-relaxed mb-4" style={{ color: "var(--ink)" }}>
            The Mayatara gives you one match. We tell you why. You get their contact.
            What happens next has nothing to do with us.
          </p>
          <p className="font-serif-india text-lg italic" style={{ color: "var(--saffron)" }}>
            &ldquo;The rest is yours.&rdquo;
          </p>
        </section>

        {/* FAQ — the questions people ask before trusting a new site, answered
            in plain text so search engines can quote them. Backed by FAQPage
            structured data at the top of this file. */}
        <section id="faq" className="py-16" style={{ background: "var(--bg-dark)", borderTop: "2px solid var(--border)", borderBottom: "2px solid var(--border)" }}>
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="gem-divider mb-10 text-sm">◆ QUESTIONS, ANSWERED ◆</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {FAQS.map(f => (
                <div key={f.q} className="card p-5">
                  <h3 className="font-typewriter text-sm mb-2 leading-snug" style={{ color: "var(--saffron)" }}>
                    {f.q}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-center mt-8" style={{ color: "var(--ink-muted)" }}>
              More on why we work this way in{" "}
              <Link href="/philosophy" style={{ color: "var(--saffron)" }}>our philosophy</Link>, or read the{" "}
              <Link href="/terms" style={{ color: "var(--saffron)" }}>terms &amp; privacy policy</Link>. Anything else —{" "}
              <Link href="/contact" style={{ color: "var(--saffron)" }}>write to us</Link>.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-2xl mx-auto px-6 pb-20 text-center">
          <div className="card p-10" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
            <div className="text-3xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
            <h2 className="font-typewriter text-xl mb-3" style={{ color: "var(--ink)" }}>
              DONE WITH HALF-MEASURES?
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
              5 questions. One match. Every Friday.<br/>
              No noise in between.
            </p>
            <Link href="/register" className="btn-primary text-base px-8 py-3">◆ &nbsp; Let&apos;s Begin</Link>

            {/* Terms + Philosophy — small, visible, before they sign up */}
            <div className="flex gap-3 justify-center mt-6 flex-wrap">
              <Link href="/philosophy"
                className="font-typewriter text-xs px-4 py-2 tracking-wide"
                style={{ border: "1px solid var(--saffron)", color: "var(--saffron)", textDecoration: "none" }}>
                ✦ Our Philosophy
              </Link>
              <Link href="/terms"
                className="font-typewriter text-xs px-4 py-2 tracking-wide"
                style={{ border: "1px solid var(--border)", color: "var(--ink-muted)", textDecoration: "none" }}>
                ◆ Terms & Privacy
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 py-6 text-center text-xs tracking-widest"
        style={{ borderColor: "var(--border)", color: "var(--ink-muted)", background: "var(--card)" }}>
        <div className="flex justify-center gap-4 text-base mb-3" style={{ color: "var(--border)" }}>
          {DECO.slice(0, 5).map((s, i) => <span key={i}>{s}</span>)}
        </div>
        <Image src="/logo.png" alt="The Mayatara" width={32} height={32} style={{ objectFit: "contain", display: "inline-block", marginBottom: "8px" }} /><br />
        THE MAYATARA · FOR THE REAL ONES · FREE FOREVER · MADE IN INDIA<br />
        <span className="inline-block mt-1 opacity-60">DESIGNED BY SILICON VALLEY ALUMNI</span><br />
        <span className="mt-1 inline-block">
          <Link href="/register" style={{ color: "var(--saffron)", textDecoration: "none" }}>Create Account</Link>
          &nbsp;·&nbsp;
          <Link href="/login" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Log In</Link>
          &nbsp;·&nbsp;
          <Link href="/compatibility" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Compatibility Check</Link>
          &nbsp;·&nbsp;
          <Link href="/terms" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Terms & Privacy</Link>
          &nbsp;·&nbsp;
          <Link href="/philosophy" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Our Philosophy</Link>
          &nbsp;·&nbsp;
          <Link href="/contact" style={{ color: "var(--ink-muted)", textDecoration: "none" }}>Report &amp; Contact</Link>
        </span>
      </footer>
    </div>
  );
}
