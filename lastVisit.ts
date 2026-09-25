'use client'

import { useSyncExternalStore } from 'react'

const LAST_VISIT_KEY = 'oppidx_last_visit'

/**
 * When this visitor was last here — read once per page load, before the
 * key is overwritten with "now".
 *
 * A module-level singleton rather than per-component state because every
 * card on the board asks the same question. Thirty-four components each
 * reading localStorage and each holding their own useState would be
 * thirty-four synchronous storage reads and thirty-four separate renders
 * for one value that cannot change while the page is open.
 *
 * `undefined` means "not read yet"; `null` means "genuinely a first visit
 * (or storage is unavailable)". The distinction matters — null is a real
 * answer that suppresses every NEW badge, undefined is the pre-hydration
 * state where we must render exactly what the server rendered.
 */
let previousVisit: string | null | undefined
let capturedAt = 0

const listeners = new Set<() => void>()

function capture() {
  if (previousVisit !== undefined) return
  try {
    const stored = localStorage.getItem(LAST_VISIT_KEY)
    previousVisit = stored
    capturedAt = stored ? new Date(stored).getTime() : 0
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
  } catch {
    // Private browsing, storage disabled, quota — a missing badge is the
    // correct degradation, not an error worth surfacing.
    previousVisit = null
    capturedAt = 0
  }
  for (const l of listeners) l()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // The first subscriber triggers the read. Doing it here rather than at
  // module scope keeps the module import-safe on the server, where there
  // is no localStorage at all.
  capture()
  return () => { listeners.delete(onChange) }
}

/** Server and first client render both see `undefined`, so the markup
 * matches and nothing hydration-mismatches; the real value arrives on the
 * next tick and the badges appear. */
export function usePreviousVisit(): string | null | undefined {
  return useSyncExternalStore(subscribe, () => previousVisit, () => undefined)
}

/** True only when we know the previous visit *and* this item genuinely
 * landed after it. Unknown → false, so a first-time visitor never sees a
 * board where every single card shouts NEW. */
export function useIsNew(addedAt: string): boolean {
  const previous = usePreviousVisit()
  if (!previous) return false
  const added = new Date(addedAt).getTime()
  return Number.isFinite(added) && added > capturedAt
}
