'use client'

import { useEffect } from 'react'

/** Mounted once in the root layout — no UI, just pings /api/track-visit
 * once per full page load (not on client-side navigations, since this
 * component doesn't remount for those) so a visitor sitting through many
 * pages in one sitting still only counts as one visit for that day. */
export function VisitTracker() {
  useEffect(() => {
    fetch('/api/track-visit', { method: 'POST' }).catch(() => {})
  }, [])
  return null
}
