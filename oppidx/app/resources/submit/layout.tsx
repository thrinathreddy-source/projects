import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * Metadata carrier for a client-component page.
 *
 * page.tsx is `"use client"`, and a client component cannot export `metadata`
 * — so this indexable route was shipping as yet another page titled "OppIDX",
 * carrying the homepage's description. Same pattern as
 * app/match/compatibility/layout.tsx.
 */
export const metadata = pageMetadata({
  title: 'Submit a Resource — OppIDX',
  description: 'Share a prep guide, template, or tool that actually helped you apply — and it can help the next person chasing the same thing.',
  canonical: `${SITE_URL}/resources/submit`,
})

export default function SubmitResourceLayout({ children }: { children: React.ReactNode }) {
  return children
}
