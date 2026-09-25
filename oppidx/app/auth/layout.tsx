import type { Metadata } from 'next'

/**
 * Metadata carrier for a client-component page.
 *
 * page.tsx is `"use client"`, and a client component cannot export `metadata`
 * — so without this layout the route inherited the root layout's title and
 * shipped as yet another page called "OppIDX", with the homepage's own
 * description. Same pattern as app/match/compatibility/layout.tsx.
 *
 * noindex because this is a sign-in form: nothing here is a search result, and
 * robots.txt already disallows /auth. The two disagreed before — robots.txt
 * said don't crawl while the page itself said `index, follow`, which is the
 * combination that gets a URL indexed with no snippet.
 *
 * No canonical on purpose; a noindex page doesn't need one.
 */
export const metadata: Metadata = {
  title: 'Sign in — OppIDX',
  description: 'Sign in to OppIDX.',
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
