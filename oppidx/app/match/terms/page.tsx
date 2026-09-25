import Link from "next/link";
import { pageMetadata } from "@/lib/pageMetadata";
import { SITE_URL } from "@/lib/siteUrl";

/** See app/match/philosophy/page.tsx for why these needed their own metadata. */
export const metadata = pageMetadata({
  title: "Matching Terms & Privacy Policy — OppIDX",
  description: "What OppIDX matching is, what it is not, what happens to your data, and what you consent to when you join the pool.",
  canonical: `${SITE_URL}/match/terms`,
});

export default function TermsPage() {
  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
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
            body: `OppIDX Match is a free, open-ended social platform for human connection. It is not a dating agency, a matchmaking service, or a professional counselling service. It is a tool — like any other social platform — that helps people discover each other based on shared values and honest answers.`,
          },
          {
            title: "WE ARE NOT RESPONSIBLE FOR WHAT HAPPENS NEXT",
            body: `Once we share your contact with a match, and theirs with you, our involvement ends. Entirely. What happens between two people after a match is their responsibility — not ours. We are not liable for any outcome, positive or negative, of any connection made through this platform. This includes but is not limited to: conversations, meetings, relationships, or any consequences thereof.`,
          },
          {
            title: "WE ARE NOT A CALL CENTRE",
            body: `We have no customer support and we do not mediate personal disputes between users. The one exception is safety: if a match violates your consent or makes you unsafe, that's not a personal dispute — report it (see REPORTING below) and we will act on it. Beyond that, if something goes wrong between people who met through OppIDX Match, that is between them and, if necessary, the appropriate legal authorities.`,
          },
          {
            title: "YOUR DATA",
            body: `We use your data — that's how matching works. Your answers, preferences, and profile information are processed by our own matching algorithm to score you against the pool and generate your matches. We do not sell your data, and we do not share your profile with third parties for advertising or any purpose outside running OppIDX Match. Your contact details (phone, WhatsApp, Instagram) are encrypted at rest and only ever revealed to your confirmed match — never to us in plain text, never to anyone else.`,
          },
          {
            title: "CONSENT",
            body: `Consent is the single most important thing on this platform — in your data, in your matches, and in what happens after. You consent to how your information is used when you register, and you can withdraw that consent at any time by deleting your account. A match is an introduction, not permission for anything else: what happens after contact is exchanged requires ongoing, enthusiastic consent from both people, at every step. We take violations of that seriously — see REPORTING below.`,
          },
          {
            title: "REPORTING",
            body: `If a match makes you uncomfortable, behaves inappropriately, or does anything that violates consent, you can report them directly from your dashboard. A user reported by two separate people is automatically removed from the platform — no one gets more than two chances here. We display your match's name on your dashboard specifically so reporting is fast and unambiguous.`,
          },
          {
            title: "WHO CAN USE THIS",
            body: `You must be 18 or older to use OppIDX Match. By creating an account you confirm you are 18+. We do not knowingly collect data from anyone under 18. If we discover a user is under 18, their account will be deleted.`,
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
            body: `OppIDX Match is currently available for registration in India only. Users outside India may browse the platform but may not create an account or submit a profile to the match pool. This restriction may be lifted in future versions at our sole discretion.`,
          },
          {
            title: "EVENTS",
            body: `Hosting or RSVPing to an Event does not require an account. When you host, we collect your name and a contact (phone or WhatsApp), encrypted at rest — never shown publicly. When you RSVP, we collect your name and contact the same way, visible only to the host, never to other guests or the public. Access to manage your own event is controlled by a private link with a secret token — anyone holding that link can manage the event, so treat it like a password and don't share it. Events are unlisted by default: only people with the direct link can find or RSVP to them. Hosts can choose to list an event publicly on Resources, which makes its title, description, time, and location (but never guest names) visible to anyone. You, the host, are solely responsible for any local permits, permissions, noise regulations, or public-gathering rules your event may require — we do not verify this and it is not something we can confirm on your behalf. We screen event titles and descriptions for explicit or violent content, and any event reported by two separate people is automatically taken down pending review.`,
          },
          {
            title: "THE PULSE",
            body: `The Pulse does not require an account and we do not collect any personal data through it. The headlines shown are pulled automatically, once a day, from official government and regulatory sources: India's Press Information Bureau, Reserve Bank of India, and SEBI; the United States' Federal Register and Securities and Exchange Commission; and the United Kingdom's GOV.UK, Financial Conduct Authority, and Bank of England — plus, for India only, the business and economy sections of The Hindu, The Indian Express, and LiveMint. Every headline links back to its original source — we do not reproduce full articles, rewrite them, or claim authorship. Categorisation is done by a plain keyword filter, not by AI, and the same filter screens out political, election, and conflict-related content so this stays a policy-and-development read, not a news opinion feed.`,
          },
          {
            title: "GOVERNING LAW & JURISDICTION",
            body: `These Terms and any dispute, claim, or controversy arising out of or relating to your use of OppIDX Match — including but not limited to disputes between matched users — shall be governed exclusively by the laws of India. Any legal proceedings shall be subject to the exclusive jurisdiction of the courts of Hyderabad, Telangana, India. By using this platform you irrevocably submit to this jurisdiction and waive any objection to proceedings being brought in those courts.`,
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
          Last updated: July 2026 · OppIDX Match is free, forever.<br />
          <Link href="/" style={{ color: "var(--saffron)" }}>← Back to OppIDX</Link>
        </div>
      </div>
    </div>
  );
}
