import type { Metadata } from 'next'

/**
 * Metadata carrier for a client-component page.
 *
 * page.tsx is `"use client"`, and a client component cannot export `metadata`
 * — so without this layout the route inherited the root layout's title and
 * shipped as yet another page called "OppIDX", with the homepage's own
 * description. Same pattern as app/match/compatibility/layout.tsx.
 *
 * noindex because this is a personal account area — subscription state,
 * submissions, cancellation. It was `index, follow` and absent from
 * robots.txt, so nothing was stopping it being crawled and indexed as a thin
 * duplicate of the homepage description. Applies to /account/dashboard and
 * /account/register underneath it too, which are equally private.
 */
export const metadata: Metadata = {
  title: 'Your account — OppIDX',
  description: 'Manage your OppIDX account, submissions, and subscription.',
  robots: { index: false, follow: true },
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children
}
