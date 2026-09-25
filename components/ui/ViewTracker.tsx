'use client'

import { useEffect, useRef } from 'react'

/** Fires once when an opportunity's own page is actually opened — that's the
 * real "view" moment (the visitor now has the information that this
 * opportunity exists), not when they later click through to apply elsewhere.
 *
 * Guarded by a ref keyed on `id` rather than firing directly in the effect:
 * React's Strict Mode (on by default in dev) double-invokes effects, so an
 * unguarded fetch here would count every real view as two. The ref persists
 * across that synthetic double-invoke (same component instance), so the
 * second call is skipped — but still re-fires correctly if `id` genuinely
 * changes, e.g. client-side navigation between two opportunity pages. */
export function ViewTracker({ id }: { id: string }) {
  const trackedId = useRef<string | null>(null)

  useEffect(() => {
    if (trackedId.current === id) return
    trackedId.current = id
    fetch(`/api/opportunities/${id}/view`, { method: 'POST' }).catch(() => {})
  }, [id])

  return null
}
