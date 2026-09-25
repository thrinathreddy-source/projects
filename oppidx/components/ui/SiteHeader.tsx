'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Wordmark } from '@/components/ui/Wordmark'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DISCORD_INVITE_URL } from '@/lib/discord'
import { SOCIAL_CHANNELS_ENABLED } from '@/lib/socialChannels'

/**
 * The five real destinations, shown on every page.
 *
 * Before this existed, `app/layout.tsx` rendered no chrome at all and each
 * page hand-rolled its own header whose entire navigation was a single
 * back-link to `/` — in three different wordings ("← OppIDX", "← Back",
 * "← Back to OppIDX"). The listing page, which is where search traffic
 * actually lands, had no header whatsoever. The effect was that every
 * relationship in the database pointed *inward* at a listing and there was
 * no way to walk back out of one: the graph was real, the path through it
 * wasn't. This is that path.
 */
const NAV = [
  { href: '/browse',      label: 'Browse' },
  { href: '/collections', label: 'Collections' },
  { href: '/resources',   label: 'Resources' },
  { href: '/pulse',       label: 'Pulse' },
  { href: '/manifesto',   label: 'Manifesto' },
]

/** Secondary destinations — real pages that don't earn a top-level slot but
 * shouldn't be unreachable from anywhere but the homepage either. */
const MORE: { href: string; label: string; desc: string; accent?: string }[] = [
  { href: '/companies',  label: 'By company',   desc: 'Every org hiring on the board.' },
  { href: '/regions',    label: 'By region',    desc: 'Where the opportunities are.' },
  // No slot here for the standalone product that used to sit in this list —
  // it lives on its own domain now. Matching itself stayed on OppIDX and still
  // runs; it's reached from "Find your person" on a listing (components/ui/
  // EcosystemActions.tsx) rather than from a hub page, same as it already was
  // for everyone who never opened this menu.
  { href: '/widget',     label: 'Embed the widget', desc: 'Opportunity of the Day, on your site.' },
  { href: '/advertise',  label: 'Advertise',    desc: 'Reach people actively looking.' },
]

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

/** Routes straight into /browse's real search — same contract the
 * WebSite/SearchAction JSON-LD in app/layout.tsx advertises to Google. */
function HeaderSearch({ onSubmitted }: { onSubmitted?: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    router.push(value.trim() ? `/browse?search=${encodeURIComponent(value.trim())}` : '/browse')
    onSubmitted?.()
  }

  return (
    <form onSubmit={submit} className="hdr-search" role="search">
      <span aria-hidden>⌕</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search opportunities…"
        aria-label="Search opportunities"
      />
    </form>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the drawer on navigation — without this it stays open over the
  // page you just moved to, since the layout (and therefore this component)
  // never unmounts between route changes. Adjusted during render rather than
  // in an effect: an effect would paint the new page with the drawer still
  // open for a frame, and React flags the cascading render.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setMenuOpen(false)
  }

  // A drawer that scrolls the page behind it reads as broken on a phone,
  // which is where this drawer is the *only* navigation.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="site-brand" aria-label="OppIDX home">
            <Image src="/logo.png" alt="" width={30} height={30} priority />
            <Wordmark size={17} />
          </Link>

          <nav className="site-nav" aria-label="Primary">
            {NAV.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={isActive(pathname, l.href) ? 'site-nav-link is-active' : 'site-nav-link'}
                aria-current={isActive(pathname, l.href) ? 'page' : undefined}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="site-header-actions">
            <HeaderSearch />
            <ThemeToggle />
            <Link href="/saved" className="site-nav-link site-nav-icon" title="Saved">★ <span>Saved</span></Link>
            <Link href="/account" className="site-nav-link site-hide-sm">Log in</Link>
            <Link href="/submit" className="btn-solid site-hide-sm">+ Enlist</Link>
            <button
              type="button"
              className="site-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* ── Drawer: full navigation on phones, "more" on desktop ── */}
      <div
        className={menuOpen ? 'site-drawer-scrim is-open' : 'site-drawer-scrim'}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <div className={menuOpen ? 'site-drawer is-open' : 'site-drawer'} role="dialog" aria-modal={menuOpen} aria-label="Menu" hidden={!menuOpen}>
        <div className="site-drawer-head">
          <Wordmark size={18} />
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="site-drawer-close">×</button>
        </div>

        <div className="site-drawer-search"><HeaderSearch onSubmitted={() => setMenuOpen(false)} /></div>

        <div className="drawer-label">Board</div>
        <div className="site-drawer-links">
          {NAV.map(l => (
            <Link key={l.href} href={l.href} className={isActive(pathname, l.href) ? 'site-drawer-link is-active' : 'site-drawer-link'}>
              {l.label}
            </Link>
          ))}
          <Link href="/saved" className="site-drawer-link">Saved</Link>
        </div>

        <div className="drawer-label">Browse by who you are</div>
        <div className="site-drawer-chips">
          <Link href="/collections/students" className="chip">Students</Link>
          <Link href="/collections/early-career" className="chip">Early career</Link>
          <Link href="/collections/founders" className="chip">Founders</Link>
        </div>

        <div className="drawer-label">More ways in</div>
        <div className="site-drawer-cards">
          {MORE.map(l => (
            <Link key={l.href} href={l.href} className="card-box site-drawer-card" style={l.accent ? { borderColor: l.accent } : undefined}>
              <span className="site-drawer-card-title">{l.label}</span>
              <span className="site-drawer-card-desc">{l.desc}</span>
            </Link>
          ))}
        </div>

        <div className="site-drawer-cta">
          <Link href="/submit" className="btn-solid btn-block">+ Enlist your opportunity (free)</Link>
          <Link href="/account" className="btn-outline btn-block">Your dashboard</Link>
        </div>

        {SOCIAL_CHANNELS_ENABLED && (
          <div className="site-drawer-links">
            <a href="https://t.me/oppurtunityindex" target="_blank" rel="noopener noreferrer" className="site-drawer-link">Telegram</a>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="site-drawer-link">Discord</a>
          </div>
        )}
      </div>
    </>
  )
}
