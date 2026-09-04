'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Routes straight into /browse's real search instead of asking anyone to
 * pick a room first — the hero's job is to get someone looking at real
 * opportunities in one action, not to explain the platform.
 *
 * Extracted from the old client-only homepage so the rest of the hero can
 * render on the server; this is the only genuinely interactive part of it.
 */
export function HeroSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    router.push(value.trim() ? `/browse?search=${encodeURIComponent(value.trim())}` : '/browse')
  }

  return (
    <form onSubmit={submit} className="hero-search" role="search">
      <span style={{ color: 'var(--ink-3)' }} aria-hidden>⌕</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search internships, scholarships, grants…"
        aria-label="Search opportunities"
      />
      <button type="submit">Search</button>
    </form>
  )
}
