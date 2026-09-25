import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'

/**
 * A real footer on every page — the cheapest way to make the board's own
 * structure (collections, companies, regions) reachable and crawlable from
 * anywhere, including the listing pages search traffic lands on. Server
 * component: this is static link markup, so it costs no client JS and ships
 * in the server HTML where crawlers actually see it.
 */
const COLUMNS: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
  {
    heading: 'The board',
    links: [
      { href: '/browse', label: 'Search everything' },
      { href: '/collections', label: 'All collections' },
      { href: '/companies', label: 'By company' },
      { href: '/regions', label: 'By region' },
      { href: '/saved', label: 'Saved' },
    ],
  },
  {
    heading: 'Who you are',
    links: [
      { href: '/collections/students', label: 'Students' },
      { href: '/collections/early-career', label: 'Early career' },
      { href: '/collections/founders', label: 'Founders' },
    ],
  },
  {
    heading: 'Read',
    links: [
      { href: '/manifesto', label: 'The manifesto' },
      { href: '/proof', label: 'Does this work?' },
      { href: '/pulse', label: 'Pulse' },
      { href: '/resources', label: 'Resources' },
    ],
  },
  {
    heading: 'Take part',
    links: [
      { href: '/submit', label: 'Enlist an opportunity' },
      { href: '/resources/submit', label: 'Submit a resource' },
      { href: '/widget', label: 'Embed the widget' },
      { href: '/advertise', label: 'Advertise' },
      { href: '/account', label: 'Your dashboard' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Wordmark size={18} />
          <p>Every real opportunity, checked before it goes up. By the youth, for the youth.</p>
        </div>

        <div className="site-footer-cols">
          {COLUMNS.map(col => (
            <nav key={col.heading} aria-label={col.heading}>
              <div className="site-footer-heading">{col.heading}</div>
              {col.links.map(l => (
                <Link key={l.href} href={l.href}>{l.label}</Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className="site-footer-base">
        <span>© {new Date().getFullYear()} OppIDX</span>
        <Link href="/terms">Terms &amp; privacy</Link>
        <Link href="/manifesto">How we stay honest</Link>
        <a href="/feed.xml">RSS</a>
      </div>
    </footer>
  )
}
