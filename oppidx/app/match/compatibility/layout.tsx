import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * Metadata carrier for a client-component page.
 *
 * page.tsx is `"use client"`, and a client component cannot export
 * `metadata` — so without this layout the route silently inherited the root
 * layout's title and shipped as yet another page called "OppIDX". See
 * app/match/philosophy/page.tsx for the full note.
 */
export const metadata = pageMetadata({
  title: 'Two-person compatibility check — OppIDX',
  description: 'Answer honestly about how you attach, argue and recover, and see how two people actually line up — measured against a research baseline, not a vibe.',
  canonical: `${SITE_URL}/match/compatibility`,
})

export default function CompatibilityLayout({ children }: { children: React.ReactNode }) {
  return children
}
