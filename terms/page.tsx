import Link from 'next/link'
import { PAYWALL_ENABLED } from '@/lib/limits'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--pin)', marginBottom: 8, fontFamily: 'var(--font-mono)',
      }}>
        ◆ {title}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  )
}

// pageMetadata rather than a bare object: this page is in the sitemap and
// indexable, but was emitting no canonical at all and inheriting the root
// layout's generic og:title on every share.
export const metadata = pageMetadata({
  title: 'Terms & Privacy — OppIDX',
  description: 'Plain English. No legal theatre.',
  canonical: `${SITE_URL}/terms`,
})

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>
          ← Back to OppIDX
        </Link>

        <div className="card-box" style={{ marginTop: 20, padding: '36px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 14 }}>◆</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 8 }}>
              Terms &amp; Privacy Policy
            </h1>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              Plain English. No legal theatre.
            </p>
          </div>

          <Section title="What this is">
            OppIDX is a premium, hand-curated directory of internships, scholarships, fellowships, grants, and
            competitions. It is not a recruiter, not an application service, and not affiliated with any
            organization listed here. It is an index — a pointer to real opportunities elsewhere on the web.
            {PAYWALL_ENABLED
              ? 'A limited slice of the board is free to browse; full search is a paid subscription (see /pricing).'
              : 'The whole board is free to search in full right now.'}
          </Section>

          <Section title="Content standards">
            Every listing — scraped or submitted — must link to exactly one place: a secure (https) URL on the
            organization&apos;s own site where the application actually happens. No shortened, redirected, or
            social-platform link may stand in for that. Listings may not contain phone numbers, email
            addresses, @handles, or any instruction to contact someone directly (WhatsApp, Telegram, DMs, or
            otherwise) in place of a real application process. Nothing illegal or suggestive is permitted. We
            reserve the right to reject, remove, or unpublish any listing that fails these standards, at our
            discretion, at any time — including one that was previously live.
          </Section>

          <Section title="Submitting a listing">
            Anyone can submit a listing at /submit, free — OppIDX never charges for a listing itself, only for
            advertisements (see /advertise). A human reviews every submission against the content standards
            above before it goes live; nothing is published automatically.
            <br /><br />
            A listing that&apos;s live can still be removed later if it turns out to be false, stale, or in
            violation of these terms.
          </Section>

          <Section title="Subscriptions, billing, and cancellation">
            {!PAYWALL_ENABLED && (
              <>
                OppIDX is not selling subscriptions at the moment — search is free for everyone, and there is
                nothing to buy. The terms below still apply in full to anyone who subscribed while it was paid.
                <br /><br />
              </>
            )}
            Full search is a recurring paid subscription (₹29/month or ₹299/year, billed by Razorpay). You can
            cancel anytime, effective immediately, with no login or password required — go to /account, enter
            the email you subscribed with, and cancel. We never store your card or payment details ourselves;
            Razorpay handles and holds all of that. If a renewal payment fails, your subscription is paused and
            your account returns to the free tier — /account will tell you if that&apos;s happened. Refunds for
            already-completed billing periods are not automatic; contact us if you believe a charge was made in
            error.
          </Section>

          <Section title="We are not responsible for what happens next">
            When you click &quot;Apply,&quot; you leave OppIDX and deal directly with that organization. We have no
            role in their selection process, no visibility into your application, and no ability to intervene
            on your behalf. Any outcome of an application — positive or negative — is between you and them,
            not us.
          </Section>

          <Section title="We are not a support desk">
            We have no customer support line, no dispute resolution process, and no mediation between you and
            any organization listed. We also don&apos;t provide prep materials, coaching, or application review —
            you&apos;ll need to prepare for each opportunity on your own. If something about an application process
            goes wrong, that&apos;s between you and the organization running it.
          </Section>

          <Section title="How listings get here">
            Three ways. First, a native scraper built into this site checks a short, fixed list of real,
            already-vetted public sources (job boards, hackathon platforms, government grant databases,
            community-maintained listings, and individual companies&apos; own career-page APIs) automatically, on
            an hourly schedule, and maps what those sources publish onto plain, deterministic rules — no AI
            writes, invents, or selects any part of a listing, and no person reviews these one by one before
            they go live; the vetting happened at the source level, once. Second, listings are occasionally
            added by hand by us after being checked directly against the organization&apos;s own page. Third,
            anyone can submit a listing for a fee at /submit — these go through the same kind of automated
            content-standards check described above (see &quot;Submitting a listing&quot;) rather than a person reading
            each one, and go live immediately once that check and payment both clear. Where a source or
            submitter doesn&apos;t state something (like eligibility), we leave that field blank rather than guess.
          </Section>

          <Section title="Where the home page's people-count numbers come from">
            OppIDX also runs in person — the same idea, offline at school and college campus drives, not just
            on this website. Both the &quot;Subscribers&quot; and &quot;Opportunity Viewers&quot; numbers on the home page are the
            honest total of two sources: everyone who joined here on the website, plus everyone reached through
            an offline run. We add the offline totals by hand as each run reports its numbers, since those
            people don&apos;t create a website account or generate a page view here. Neither figure is a
            website-only number, and we&apos;re not going to pretend otherwise.
          </Section>

          <Section title="No guarantees">
            Listings can go stale between checks. Deadlines, eligibility, and compensation are set by the
            organization running the program, not by us, and can change without notice on their end. Always
            confirm the details that matter to you on the organization&apos;s own page before relying on anything
            you read here.
          </Section>

          <Section title="Your data">
            We collect only what identifies your subscription or saved listings: your email, and — if you
            subscribe — the plan and billing status Razorpay reports back to us. We never see or store your
            card number, UPI ID, or any other payment credential; that stays with Razorpay. If you subscribe or
            save a listing, we set a signed cookie on your browser to recognize you on return visits — it holds
            no personal data itself, just a reference to your account. Page views on individual listings are
            counted in aggregate as a single running number, not tied to any visitor&apos;s identity. We do not sell
            data, and we do not share your email with anyone outside OppIDX and the payment processor needed to
            bill you.
          </Section>

          <Section title="Who can use this">
            Anyone can browse OppIDX — no account or login is required to see listings. Subscribing or saving a
            listing creates a lightweight record tied to your email, not a traditional username/password
            account — see &quot;Your data&quot; above for exactly what that involves. The only separate login on this
            site belongs to the site&apos;s own admin account, used to manage and verify listings.
          </Section>

          <Section title="Governing law">
            These Terms are governed by the laws of India. Any dispute arising from your use of OppIDX is
            subject to Indian law.
          </Section>

          <Section title="Changes">
            We may update these terms as the site changes. We&apos;ll update the date below when we do.
            Continuing to use OppIDX after a change means you accept the current version.
          </Section>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20, marginTop: 30, textAlign: 'center' }}>
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              Last updated: July 2026 · A limited slice of OppIDX is free to browse. Full search and listing submissions come at a cost.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
