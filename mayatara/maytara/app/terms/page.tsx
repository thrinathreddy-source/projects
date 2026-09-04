import type { Metadata } from "next";
import Link from "next/link";
import { GRIEVANCE_OFFICER } from "@/lib/grievance";
import JsonLd from "../components/JsonLd";
import { pageMetadata, breadcrumbSchema } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms & Privacy",
  description:
    "Plain English, no legal theatre: what The Mayatara is, what we store, how contacts are encrypted, what we are not responsible for, and how to delete your data.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <JsonLd
        id="ld-breadcrumb-terms"
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Terms & Privacy", path: "/terms" },
        ])}
      />
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>TERMS & PRIVACY</span>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <div className="text-3xl mb-6 text-center" style={{ color: "var(--saffron)" }}>◆</div>
        <h1 className="font-typewriter text-2xl mb-2 text-center" style={{ color: "var(--ink)" }}>TERMS & PRIVACY POLICY</h1>
        <p className="text-xs text-center mb-10" style={{ color: "var(--ink-muted)" }}>Plain English. No legal theatre.</p>

        {[
          {
            title: "WHAT THIS IS",
            body: `The Mayatara is a free, open-ended social platform for human connection. It is not a dating agency, a matchmaking service, or a professional counselling service. It is a tool — like any other social platform — that helps people discover each other based on shared values and honest answers.`,
          },
          {
            title: "WE ARE NOT RESPONSIBLE FOR WHAT HAPPENS NEXT",
            body: `Once we share your contact with a match, and theirs with you, our involvement ends. Entirely. What happens between two people after a match is their responsibility — not ours. We are not liable for any outcome, positive or negative, of any connection made through this platform. This includes but is not limited to: conversations, meetings, relationships, or any consequences thereof.`,
          },
          {
            title: "WE ARE NOT A CALL CENTRE",
            body: `We do not mediate personal disputes between users, and there is no helpline to call. What we do have is one channel — the Report & Contact page — and a person reads everything that arrives there. Use it for safety reports, grievances, and anything to do with your data. Beyond that, if something goes wrong between people who met through The Mayatara, that is between them and, if necessary, the appropriate legal authorities.`,
          },
          {
            title: "YOUR DATA",
            body: `We use your data — that's how matching works. Your answers, preferences, and profile information are processed by our own matching algorithm to score you against the pool and generate your matches. We do not sell your data, and we do not share your profile with third parties for advertising or any purpose outside running The Mayatara. Your contact details (phone, WhatsApp, Instagram) are encrypted at rest and only ever revealed to your confirmed match — never to us in plain text, never to anyone else.`,
          },
          {
            title: "FAITH",
            body: `Religion or faith is an optional field, on both sides: yours, and what you're looking for in someone else. We ask because being matched entirely blind is uncomfortable for a lot of people, and faith is one of the few things worth knowing before you meet a stranger. Leave it empty, or write "open" or "any", and we treat it as something you don't filter on — you will not be scored down for that. It is one factor among many and never a hard block on its own. It is used only for matching, and is covered by everything in YOUR DATA above.`,
          },
          {
            title: "CONSENT",
            body: `Consent is the single most important thing on this platform — in your data, in your matches, and in what happens after. You consent to how your information is used when you register, and you can withdraw that consent at any time by asking us to delete your account (see YOUR RIGHTS OVER YOUR DATA below). A match is an introduction, not permission for anything else: what happens after contact is exchanged requires ongoing, enthusiastic consent from both people, at every step. We take violations of that seriously — see REPORTING below.`,
          },
          {
            title: "YOUR RIGHTS OVER YOUR DATA",
            body: `You can ask us to delete your account, correct anything wrong in it, or send you a copy of what we hold. Use the Report & Contact page and pick the matching option. We action these within 15 days of confirming the request came from the account holder. Deleting removes your profile, your answers, your encrypted contact details, and your match history — it is not a deactivation, and we cannot undo it afterwards.`,
          },
          {
            title: "REPORTING",
            body: `If a match makes you uncomfortable, behaves inappropriately, or does anything that violates consent, you can report them directly from your dashboard. A user reported by two separate people is automatically removed from the platform — no one gets more than two chances here. We display your match's name on your dashboard specifically so reporting is fast and unambiguous. If you would rather not use the dashboard, or you no longer have access to your account, the Report & Contact page reaches the same place and safety reports there are acknowledged within 24 hours.`,
          },
          {
            title: "GRIEVANCE REDRESSAL",
            body: `As required of an intermediary under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, we publish a grievance channel: the Report & Contact page. ${GRIEVANCE_OFFICER ? `Our designated Grievance Officer is ${GRIEVANCE_OFFICER}, reachable through that page. ` : ""}We acknowledge every grievance within 24 hours of receiving it and resolve it within 15 days. You will get a reference number when you submit — quote it if you need to follow up.`,
          },
          {
            title: "WHO CAN USE THIS",
            body: `You must be 18 or older to use The Mayatara. By creating an account you confirm you are 18+. We do not knowingly collect data from anyone under 18. If we discover a user is under 18, their account will be deleted.`,
          },
          {
            title: "AGE PREFERENCES",
            body: `Our algorithm does not match people with an age gap greater than 5 years by default, in keeping with our belief in equitable connections. This is a preference setting, not a hard rule, and may be adjusted in future versions.`,
          },
          {
            title: "COMMUNITY MATCHING",
            body: `If you provide your institution or company name, we may use it to prioritise matches within your community. This is opt-in. You are not required to provide it.`,
          },
          {
            title: "FAIR EXCHANGE",
            body: `The "What You Want In Them" fields during registration are optional. Fill in only what genuinely matters to you. We match you on your stated preferences only if you have shared the equivalent information about yourself — we will not filter someone out on criteria you have not been honest about yourself.`,
          },
          {
            title: "HOW MATCHING WORKS",
            body: `Our algorithm scores every pair in the pool against each other across values, personality, life direction, and stated preferences. Only pairs that score 75% or above are eligible to be matched. Within that eligible pool, the highest-scoring pairs are matched first — so if two people are both a strong fit for you, the stronger fit gets priority. If nobody in the current pool crosses the 75% threshold for you, you will receive a no-match notification and remain in the pool for the following Friday. A high score is a signal, not a guarantee — the rest is up to you.`,
          },
          {
            title: "NO GUARANTEES",
            body: `We make no guarantees about the quality, suitability, accuracy, or outcome of any match. The algorithm does its best. Human beings are complex. We are just asking better questions.`,
          },
          {
            title: "AVAILABILITY & ELIGIBILITY",
            body: `The Mayatara is currently available for registration in India only. Users outside India may browse the platform but may not create an account or submit a profile to the match pool. This restriction may be lifted in future versions at our sole discretion.`,
          },
          {
            title: "GOVERNING LAW & JURISDICTION",
            body: `These Terms and any dispute, claim, or controversy arising out of or relating to your use of The Mayatara — including but not limited to disputes between matched users — shall be governed exclusively by the laws of India. Any legal proceedings shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana, India. By using this platform you irrevocably submit to this jurisdiction and waive any objection to proceedings being brought in those courts.`,
          },
          {
            title: "CHANGES",
            body: `We may update these terms. We will note the date of the last update below. Continuing to use the platform means you accept the current terms.`,
          },
        ].map((s) => (
          <div key={s.title} className="mb-8">
            <div className="font-typewriter text-xs tracking-widest mb-2" style={{ color: "var(--saffron)" }}>◆ {s.title}</div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{s.body}</p>
          </div>
        ))}

        <div className="mt-10 p-5 text-xs text-center leading-relaxed"
          style={{ borderTop: "2px solid var(--border)", color: "var(--ink-muted)" }}>
          <div className="font-typewriter tracking-widest mb-3" style={{ color: "var(--maroon)" }}>
            ◆ JURISDICTION: HYDERABAD, TELANGANA, INDIA ◆
          </div>
          All disputes are subject to the exclusive jurisdiction of courts in Hyderabad, India.<br />
          Indian law governs this platform and all interactions arising from it.<br /><br />
          <Link href="/contact" style={{ color: "var(--saffron)" }}>Report &amp; Contact — grievances, safety, and data requests</Link><br /><br />
          Last updated: August 2026 · The Mayatara is free, forever.<br />
          <Link href="/" style={{ color: "var(--saffron)" }}>← Back to The Mayatara</Link>
        </div>
      </div>
    </div>
  );
}
