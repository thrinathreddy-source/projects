'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { THEME_KEY, resolveTheme, type ThemeMode } from '@/lib/theme'

/** Auto → Light → Dark → Auto. Auto is first because it's the default and
 * the one most people should stay on; the two pins exist for anyone the
 * schedule doesn't suit (night shift, a bright office after dark). */
const ORDER: ThemeMode[] = ['auto', 'light', 'dark']

const FACE: Record<ThemeMode, { icon: string; label: string }> = {
  auto:  { icon: '◐', label: 'Theme: follows the time of day' },
  light: { icon: '☀', label: 'Theme: always light' },
  dark:  { icon: '☾', label: 'Theme: always dark' },
}

function apply(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', resolveTheme(mode, new Date().getHours()))
}

/* ── The stored mode, as an external store ───────────────────────────
   localStorage is exactly the "external system" useSyncExternalStore
   exists for. Reading it in an effect and calling setState works, but
   it renders twice on every mount and React's own lint rule flags it;
   this reads it during render instead, while still rendering `null` on
   the server so the markup matches.

   `storage` covers the same site open in another tab — change the theme
   in one and the others follow instead of silently disagreeing. ──── */
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null
    return stored && ORDER.includes(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

/** Server (and the first client render) know nothing about this browser's
 * choice, so both render the button empty and it fills in on hydration.
 * Returning a constant here is what keeps that from being a mismatch. */
const getServerMode = (): ThemeMode | null => null

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode)

  // On 'auto', the resolved theme depends on a clock that keeps moving. A
  // tab left open through 19:00 — which is exactly what a long browsing
  // session looks like — would otherwise stay in the daytime palette until
  // the next navigation. This only ever touches the DOM, never React
  // state, so it is a legitimate effect. No-op when a mode is pinned.
  useEffect(() => {
    if (mode !== 'auto') return
    const tick = () => apply('auto')
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [mode])

  const cycle = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(mode ?? 'auto') + 1) % ORDER.length]
    try { localStorage.setItem(THEME_KEY, next) } catch { /* storage disabled — the theme still applies for this page */ }
    apply(next)
    // Tell every subscriber (this button, and the same button in another
    // tab via `storage`) to re-read. `storage` does not fire in the tab
    // that performed the write, which is why the local set exists.
    for (const l of listeners) l()
  }, [mode])

  const face = mode ? FACE[mode] : null

  return (
    <button
      type="button"
      onClick={cycle}
      className="theme-toggle"
      title={face?.label ?? 'Theme'}
      aria-label={face?.label ?? 'Theme'}
    >
      {/* Empty until mounted so SSR and first client render agree; the
          button keeps its box either way, so nothing shifts when it fills. */}
      <span aria-hidden>{face?.icon ?? ''}</span>
    </button>
  )
}
