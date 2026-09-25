'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The two controls that follow you down every page: search, and back to
 * the top.
 *
 * Mounted once in SiteChrome rather than inside the homepage feed, so it
 * is genuinely always there — the previous version only existed on the
 * homepage, which meant it vanished on exactly the long pages (a
 * collection, a region, /browse) where a 200-card scroll makes it most
 * useful.
 *
 * Deliberately stateless. An earlier version tracked scroll position so
 * it could disable "back to top" near the top of the page, which bought
 * nothing — at scroll 0 the button is already a no-op — and cost a
 * subscription whose value has to survive hydration and client-side
 * navigation. Both buttons are simply always live.
 *
 * Search prefers the hero search box on whatever page you are on: it is
 * already there, and scrolling to it keeps the pages of feed you have
 * loaded. Only when the page has no hero search does it navigate to
 * /browse, which is the site's real search surface.
 */
/** Honour the OS "reduce motion" setting: a 4,000px smooth scroll is a
 * long, unskippable animation, and it is precisely the kind of thing that
 * setting exists to switch off. Everything else on this site already
 * respects it via CSS; scrollTo has to be told in JS. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function FloatingRail() {
  const router = useRouter()

  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }, [])

  const toSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>('.hero-search input')
    if (!input) {
      router.push('/browse')
      return
    }
    const behavior = scrollBehavior()
    window.scrollTo({ top: 0, behavior })
    // Focusing straight away yanks the viewport to the top and cancels the
    // smooth scroll on iOS; let the scroll land first. preventScroll keeps
    // the focus itself from re-jumping. With motion reduced the scroll is
    // instant, so there is nothing to wait for.
    if (behavior === 'auto') input.focus({ preventScroll: true })
    else window.setTimeout(() => input.focus({ preventScroll: true }), 420)
  }, [router])

  return (
    <div className="float-rail">
      <button
        type="button"
        onClick={toSearch}
        className="float-btn is-primary"
        aria-label="Search opportunities"
        title="Search opportunities"
      >
        <span aria-hidden>🔍</span>
      </button>
      <button
        type="button"
        onClick={toTop}
        className="float-btn"
        aria-label="Back to top"
        title="Back to top"
      >
        <span aria-hidden>↑</span>
      </button>
    </div>
  )
}
