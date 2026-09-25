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
  title: 'List a Gathering — OppIDX',
  description: 'Put a meetup, workshop, or talk in front of the people already chasing opportunities in your field.',
  canonical: `${SITE_URL}/events/new`,
})

export default function NewEventLayout({ children }: { children: React.ReactNode }) {
  return children
}
