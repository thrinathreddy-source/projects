import Link from 'next/link'
import type { Metadata } from 'next'
import { ShareBar } from '@/components/ui/ShareBar'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'

/**
 * Was /philosophy — a page with no share card, no header, no nav slot, and
 * one entry point buried behind the homepage's "More" panel. It contained the
 * sharpest writing on the site and nothing linked to it.
 *
 * Moved here, given an OG image and a share bar, put in the site nav, and
 * reordered so the identity leads instead of trailing nine sections behind.
 * /philosophy 308s here (see app/philosophy/page.tsx) so every existing link
 * and the indexed URL keep working.
 */
export const metadata: Metadata = pageMetadata({
  title: 'Opportunities shouldn’t require a rolodex — OppIDX',
  description: 'The opportunities that change a trajectory circulate in private Discords, insider newsletters, and group chats you have to already be in. That’s not a meritocracy — that’s a rolodex. What we do about it, and what we refuse to do.',
  canonical: `${SITE_URL}/manifesto`,
  image: 'route', // app/manifesto/opengraph-image.tsx
})

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--pin)', marginBottom: 8, fontFamily: 'var(--font-mono)',
      }}>
        ◆ {title}
      </h2>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  )
}

export default function ManifestoPage() {
  return (
    <div style={{ padding: '30px var(--gutter) 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="card-box card-pad-lg">
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 14, fontFamily: 'var(--font-mono)', letterSpacing: 8 }}>◆ ✦ ◆</div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5.6vw, 36px)',
              lineHeight: 1.25, color: 'var(--ink)', textTransform: 'uppercase', textWrap: 'balance',
            }}>
              Opportunities shouldn&apos;t<br />
              <span style={{ color: 'var(--pin)' }}>require a rolodex.</span>
            </h1>
          </div>

          {/* Leads the page now instead of closing it. The old version put
              this last and then disclaimed it — "not an official title, not a
              membership card" — which is not something a name people actually
              adopt has ever said about itself. */}
          <Section title="We call them Chasers">
            <p>
              Not users. Not subscribers. A <strong>Chaser</strong> is someone who finds a real opportunity,
              goes after it, and doesn&apos;t get played by a fake deadline on the way.
            </p>
            <p>
              That&apos;s the whole bar. You don&apos;t apply to be one and there&apos;s nothing to join. You
              either chase things or you don&apos;t — this board just makes sure the things worth chasing are
              actually findable.
            </p>
          </Section>

          <Section title="On access">
            <p>
              The opportunities that actually change someone&apos;s trajectory — the internship that becomes a
              career, the grant that funds the first version of an idea, the fellowship that opens a door
              nobody else would open — are rarely posted where everyone can see them. They circulate in
              private Discords, insider newsletters, alumni networks, group chats you have to already be in.
            </p>
            <p style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>
              That&apos;s not a meritocracy. That&apos;s a rolodex.
            </p>
            <p>
              The information exists; it&apos;s just gated by who you happen to know — not by who&apos;s
              actually ambitious enough to go after it.
            </p>
          </Section>

          <Section title="On honesty">
            <p>
              We don&apos;t inflate the numbers on this site. The counts you see are pulled live from the same
              database that powers the board — not a marketing figure, not a round number that sounds
              impressive. If a source stops publishing a listing, it comes down.
            </p>
            <p>
              The Subscribers and Opportunity Viewers counts both include people reached offline — at school
              and college campus drives, not on this website — added by hand, honestly, on top of the live
              numbers. We&apos;re telling you that plainly instead of quietly folding it in. See{' '}
              <Link href="/terms" style={{ color: 'var(--pin)' }}>/terms</Link> for the full accounting.
            </p>
            <p>
              If we don&apos;t know something about a listing — exact eligibility, what to prepare — we leave
              it blank. We&apos;d rather show you less than show you something we made up.
            </p>
          </Section>

          <Section title="On standards">
            <p>
              This is a curated collection, not an open bulletin board. Every listing that reaches the board —
              whether it arrived through the scraper or was submitted by hand — is held to the same bar:
              nothing illegal, nothing suggestive, nothing that reads like bait. A listing gets exactly one
              link, and it goes straight to the organization&apos;s own application page — secure, direct,
              nothing shortened or redirected. Nothing else. No phone numbers. No @handles. No &ldquo;DM us to
              apply.&rdquo; No email address standing in for a real process. If the only way to
              &ldquo;apply&rdquo; is to message someone, it isn&apos;t a listing here — it&apos;s a contact
              request, and we don&apos;t carry those.
            </p>
          </Section>

          <Section title="On timing">
            <p>
              We don&apos;t work with deadlines. We work with opportunities. You won&apos;t find countdown
              timers or &ldquo;closing soon&rdquo; pressure here — just the fact that something real exists,
              and a link to go find out more on the source&apos;s own terms.
            </p>
            <p>
              Whether it&apos;s due tomorrow or next year isn&apos;t ours to weigh in on. The rest — going
              after it — is yours: your merit, your ambition, your timing.
            </p>
          </Section>

          <Section title="On what automation actually is">
            <p>
              We want to be honest about what the automation behind this site can and can&apos;t do — and,
              just as important, what it&apos;s allowed to touch. Every hour, it checks a short, fixed list of
              real, already-vetted public sources — job boards, hackathon platforms, government grant
              databases, community-maintained lists, and companies&apos; own career-page APIs — for anything
              new, and adds it using plain, fixed rules. Nobody reviews those listings one by one before they
              go up. They don&apos;t need to: the trust was already spent vetting the source itself, once, not
              re-litigated per listing.
            </p>
            <p>
              That trust does not extend to a stranger with a browser. Anyone submitting a listing from
              outside that fixed list — the paid submission route — gets no such pass. Every one of those is
              read by an actual person before it&apos;s allowed anywhere near the board, and paying for that
              review buys the review, never the outcome.
            </p>
            <p>
              What&apos;s constant across both paths: there is no AI writing, guessing, embellishing, or
              deciding what&apos;s &ldquo;genuine&rdquo; anywhere in this pipeline. It cannot judge whether
              you&apos;re a good fit, and it cannot know anything a source didn&apos;t already publish. The
              judgment — what&apos;s real, what clears the bar, what doesn&apos;t — is made by a person or it
              isn&apos;t made at all.
            </p>
          </Section>

          <div style={{ textAlign: 'center', margin: '34px 0 30px', fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--pin)', fontStyle: 'italic' }}>
            &ldquo;The rest is yours.&rdquo;
          </div>

          <Section title="On cost">
            <p>
              Keeping this list this clean isn&apos;t free, and we&apos;re not going to pretend it is. Listing
              something here costs the person submitting it, not just us — because a fee is the simplest
              filter against noise that a human still has to review either way. We are not chasing volume or
              ad revenue. We would rather have a smaller, genuinely elite collection than a large noisy one.
            </p>
          </Section>

          <Section title="Why we built this">
            <p>
              Because people who are smart, capable, and doing everything right still miss opportunities
              simply because nobody forwarded them the email. Because the alternatives — paid newsletters,
              scattered spreadsheets, whoever&apos;s Twitter you happen to follow — all have their own gates.
            </p>
            <p>
              We built OppIDX because we believe that putting real, hand-checked opportunities in one honest
              place — not the biggest place, the most honest one — can change who finds them. Built brick by
              brick, for the ambitious ones willing to go after it.
            </p>
          </Section>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22, marginTop: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
              Send this to someone who should read it
            </div>
            <ShareBar title="Opportunities shouldn't require a rolodex." url={`${SITE_URL}/manifesto`} />
          </div>

          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <div style={{ color: 'var(--pin)', marginBottom: 20, fontFamily: 'var(--font-mono)', letterSpacing: 8 }}>◆ ✦ ◆</div>
            <Link href="/browse" className="btn-solid" style={{ padding: '13px 26px', fontSize: 13.5 }}>
              ◆ Browse the board
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
