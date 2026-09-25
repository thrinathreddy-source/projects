'use client'

import { useEffect, useState } from 'react'
import { usePreviousVisit } from '@/lib/lastVisit'

/**
 * "N new opportunities since your last visit" — the one line on the page
 * that answers "why open this again today?".
 *
 * Reads the previous-visit timestamp through lib/lastVisit rather than
 * touching localStorage itself. It used to own that key outright, which
 * stopped working the moment the cards needed the same value to mark
 * themselves NEW: both would read *and overwrite* it, so whichever mounted
 * first got the real timestamp and the other got "now" — meaning either
 * this count or every NEW badge would silently be zero, depending on
 * render order. One reader, one write, one answer.
 *
 * Renders nothing at all on a first visit, or when nothing genuinely
 * landed since — same rule as every other count on this site: real, or
 * absent.
 */
export function NewSinceLastVisit() {
  const previousVisit = usePreviousVisit()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!previousVisit) return
    let cancelled = false
    fetch(`/api/opportunities/new-count?since=${encodeURIComponent(previousVisit)}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && data.count > 0) setCount(data.count) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [previousVisit])

  if (count === null) return null

  return (
    <div className="new-badge">
      <span className="new-badge-count">{count.toLocaleString()}</span>
      <span>
        new opportunit{count === 1 ? 'y' : 'ies'} since your last visit
        <span className="new-badge-hint">marked ▸ New below</span>
      </span>
    </div>
  )
}
