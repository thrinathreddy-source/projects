'use client'

import { usePathname } from 'next/navigation'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { FloatingRail } from '@/components/ui/FloatingRail'

/**
 * Site chrome is global — with two deliberate exceptions.
 *
 * `/embed/*` is loaded inside a third-party <iframe> (see
 * app/embed/opportunity-of-the-day/page.tsx, which is explicitly noindex and
 * documents that it must have "no nav, no footer, no back link"). Wrapping it
 * in a header would put OppIDX's whole navigation inside someone else's blog
 * post — and a click on it would navigate the host page's iframe away from
 * its own src.
 *
 * `/admin` is the owner's console, not a public page; site nav there is
 * noise. Everything else — including every listing page — gets the shell.
 */
const BARE_PREFIXES = ['/embed', '/admin']

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = BARE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))

  if (bare) return <>{children}</>

  return (
    <>
      <SiteHeader />
      <div className="site-main">{children}</div>
      <SiteFooter />
      {/* Search + back-to-top, on every page that gets the shell. Lives
          here rather than inside the homepage feed so it doesn't disappear
          on the long collection/region/browse pages where a reader is
          furthest from the header. */}
      <FloatingRail />
    </>
  )
}
