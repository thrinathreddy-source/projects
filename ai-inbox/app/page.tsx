import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { SITE_URL } from '@/lib/siteUrl'
import { getHomeFeed } from '@/lib/homeFeed'
import { OpportunityCard } from '@/components/ui/OpportunityCard'
import { NewSinceLastVisit } from '@/components/ui/NewSinceLastVisit'
import { HeroSearch } from '@/components/ui/HeroSearch'
import { SubscribeForm } from '@/components/ui/SubscribeForm'
import { SponsorSlot } from '@/components/ui/SponsorSlot'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import HomeBoard from './HomeBoard'

export const metadata: Metadata = {
  title: 'OppIDX — Internships, Scholarships, Fellowships & Grants',
  description: 'Every opportunity worth applying to, pinned up in one place. Internships, scholarships, fellowships, grants, and competitions for students, early-career job seekers, and founders — updated constantly, free to browse.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'OppIDX — the opportunity board',
    description: 'Every opportunity worth applying to, pinned up in one place.',
  },
  twitter: {
    title: 'OppIDX — the opportunity board',
    description: 'Every opportunity worth applying to, pinned up in one place.',
  },
}

// The picks are reshuffled per request (see lib/homeFeed.ts) and the board
// changes hourly as the scraper runs — there's nothing here worth caching
// across visitors, and a cached copy would freeze the rotation that gives
// people a reason to come back. The divider below says "a fresh pick every
// visit" in as many words, so caching the whole document would make the page
// lie about itself.
//
// What that used to cost: getHomeFeed() was awaited at the top of the
// component, so nothing at all was sent until every one of its queries had
// come back from Turso — the masthead, the search box and the subscribe form
// all waited on data none of them use. Measured TTFB on the site's
// highest-priority URL ranged from 0.6s to 2.6s.
//
// The fix is streaming rather than caching: everything data-dependent now
// lives in <HomeFeed />, wrapped in Suspense below, so the shell flushes
// immediately and the board streams in behind it. Per-visit rotation is
// preserved and first byte no longer waits on the database.
export const dynamic = 'force-dynamic'

const AUDIENCE_CARDS = [
  { href: '/collections/students',     icon: '🎒', label: 'Students',     desc: 'Internships, scholarships, fellowships.' },
  { href: '/collections/early-career', icon: '💼', label: 'Early career', desc: 'New-grad jobs and early-career programs.' },
  { href: '/collections/founders',     icon: '🧭', label: 'Founders',     desc: 'Grants, fellowships, competitions.' },
  { href: '/collections',              icon: '◈',  label: 'All collections →', desc: 'By location, comp type, and more.', accent: true },
]

/** Everything below the fold that needs the database. Split out purely so the
 * shell above it can be sent before any of these queries resolve. */
async function HomeFeed() {
  const { featured, board, boardTotal, extras, pulseDigests, events } = await getHomeFeed()

  return (
    <>
      <div className="divider" style={{ marginBottom: 12 }}>
        <span>◆ Best opportunities right now — a fresh pick every visit ◆</span>
      </div>
      {featured.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 20 }}>
          The editor&apos;s picks land here as soon as the first ones are curated.
        </div>
      ) : (
        <div className="card-grid" style={{ ['--card-min' as string]: '260px', marginBottom: 38 }}>
          {featured.map(item => <OpportunityCard key={item.id} opp={item} extras={extras[item.id]} />)}
        </div>
      )}

      <SponsorSlot type="feed_card" />

      <div className="divider" style={{ marginBottom: 20 }}><span>◆ The full board ◆</span></div>
      <HomeBoard
        initialItems={board}
        initialExtras={extras}
        boardTotal={boardTotal}
        featuredCount={featured.length}
        pulseDigests={pulseDigests}
        events={events}
      />
    </>
  )
}

/** Holds the space the streamed board will occupy, in the board's own card
 * silhouette, so the layout doesn't jump when it arrives. */
function HomeFeedFallback() {
  return (
    <>
      <div className="divider" style={{ marginBottom: 12 }}>
        <span>◆ Best opportunities right now — a fresh pick every visit ◆</span>
      </div>
      <div className="card-grid" style={{ ['--card-min' as string]: '260px', marginBottom: 38 }}>
        {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    </>
  )
}

export default function Page() {
  return (
    <div>
      <div style={{
        background: 'var(--pin)', color: 'var(--btn-text)', textAlign: 'center',
        padding: '7px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
      }}>
        ◆ Real opportunities, verified before they go up ◆ Free to search in full ◆
      </div>

      <header className="hero">
        <div className="page-shell">
          <div className="hero-eyebrow">◆ By the youth, for the youth</div>
          <h1>Find your next opportunity. Find your people.</h1>
          <p className="hero-lead">
            We verify every listing before it goes up. No inflated numbers, no dead links.
          </p>
          <p className="hero-sub">
            AI helps us write the daily policy digest from real headlines — everything else on the board is checked and added by hand.
          </p>

          {/* Above the search, not below it and below the fold: this is the
              one line on the page that answers "why open it again today?" */}
          <NewSinceLastVisit />

          <HeroSearch />

          <div className="card-box hero-subscribe">
            <div className="hero-subscribe-copy">
              Weekly newsletter. Best opportunities. Best communities.
            </div>
            <SubscribeForm />
          </div>
        </div>
      </header>

      <main className="page-shell" style={{ padding: '34px var(--gutter) 40px' }}>
        <div className="divider" style={{ marginBottom: 14 }}><span>◆ Browse by who you are ◆</span></div>
        <div className="card-grid audience-row" style={{ ['--card-min' as string]: '200px', gap: 14, marginBottom: 38 }}>
          {AUDIENCE_CARDS.map(c => (
            <Link
              key={c.href}
              href={c.href}
              className="card-box"
              style={{ padding: '15px 17px', textDecoration: 'none', display: 'flex', gap: 12, alignItems: 'flex-start', ...(c.accent ? { borderColor: 'var(--pin)' } : {}) }}
            >
              <span style={{ fontSize: 21 }}>{c.icon}</span>
              <span>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: c.accent ? 'var(--pin)' : 'var(--ink)' }}>{c.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{c.desc}</span>
              </span>
            </Link>
          ))}
        </div>

        <Suspense fallback={<HomeFeedFallback />}>
          <HomeFeed />
        </Suspense>
      </main>
    </div>
  )
}
