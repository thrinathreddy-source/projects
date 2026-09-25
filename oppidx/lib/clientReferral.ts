'use client'

const STORAGE_KEY = 'oppidx_ref'

/**
 * Captures a `?ref=CODE` from the current URL into localStorage, first-touch
 * only — a visitor who arrives via a referral link keeps crediting that
 * referrer even if they later convert on a page with no `ref` param.
 */
export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (ref && ref.trim() && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, ref.trim().toUpperCase())
  }
}

/** The stored referral code, if this visitor arrived via a referral link. */
export function getStoredReferralCode(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return localStorage.getItem(STORAGE_KEY) ?? undefined
}
