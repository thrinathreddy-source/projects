import type { Metadata } from 'next'
import { Special_Elite, IBM_Plex_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SITE_URL } from '@/lib/siteUrl'
import { ReferralCapture } from '@/components/ReferralCapture'
import { VisitTracker } from '@/components/VisitTracker'
import { SiteChrome } from '@/components/ui/SiteChrome'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import './globals.css'
import './stamped.css'

const typewriter = Special_Elite({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'OppIDX',
  description: 'Internships, scholarships, fellowships, grants, and competitions for students, early-career job seekers, founders, and anyone chasing a real shot. Pinned up, updated constantly, free to browse.',
  keywords: ['internships', 'scholarships', 'fellowships', 'grants', 'competitions', 'opportunities', 'students', 'founders'],
  alternates: {
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    title: 'OppIDX — the opportunity board',
    description: 'Every opportunity worth applying to, pinned up in one place.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OppIDX — the opportunity board',
    description: 'Every opportunity worth applying to, pinned up in one place.',
  },
}

// Site-wide identity — was missing entirely (only individual JobPosting
// markup existed). WebSite + SearchAction is what lets Google show a
// search box directly under the result instead of just a link; the
// url_template points at /browse's own real search param (see HeroSearch
// in app/page.tsx: `/browse?search=${query}`), not a fabricated endpoint.
// Organization backs brand-entity recognition in search (logo, sameAs).
const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'OppIDX',
      description: 'Internships, scholarships, fellowships, grants, and competitions for students, early-career job seekers, founders, and anyone chasing a real shot.',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/browse?search={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'OppIDX',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      description: 'A curated board of verified internships, scholarships, fellowships, grants, and competitions. Every listing is checked before it goes up.',
      // sameAs is how Google and AI retrieval systems tie the string "OppIDX"
      // to one entity across the web, which is what makes the board citable
      // as a source rather than just crawlable as pages. Only channels
      // actually operated by this project go here — never a guessed handle,
      // since a sameAs pointing at someone else's account is a false claim
      // about identity.
      //
      // Deliberately independent of SOCIAL_CHANNELS_ENABLED (lib/
      // socialChannels.ts). That flag hides *promotional links in the UI*
      // while the communities are small; this is a machine-readable identity
      // assertion, not a recommendation that a reader go join them. Add the
      // Instagram/LinkedIn/X profiles here as they're created.
      sameAs: [
        'https://t.me/oppurtunityindex',
        'https://discord.gg/Yde2AnypJ',
      ],
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is load-bearing, not a papered-over warning:
    // the theme script below deliberately sets data-theme on this element
    // before React hydrates, so the server HTML (no attribute) and the DOM
    // React finds (attribute present) genuinely differ by design. Without
    // this, React reports a hydration mismatch on every single page load.
    // It suppresses the warning for this element's own attributes only —
    // not for its subtree.
    <html
      lang="en"
      className={`${typewriter.variable} ${mono.variable}`}
      style={{ height: '100%' }}
      suppressHydrationWarning
    >
      <head>
        {/* Must run before the first paint, so it lives in <head> as a
            blocking inline script rather than in a component. See
            lib/theme.ts for why it isn't a normal module. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd).replace(/</g, '\\u003c') }} />
        <ReferralCapture />
        <VisitTracker />
        {/* One persistent header + footer for the whole site. Every page used
            to hand-roll its own header whose only navigation was a back-link
            to "/", and the listing pages search traffic lands on had none at
            all — see components/ui/SiteChrome.tsx for the two surfaces that
            deliberately stay bare. */}
        <SiteChrome>{children}</SiteChrome>
        <Analytics />
      </body>
    </html>
  )
}
