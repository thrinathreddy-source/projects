import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PAYWALL_ENABLED } from '@/lib/limits'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import PricingClient from './PricingClient'

export const metadata: Metadata = pageMetadata({
  title: 'Pricing — OppIDX',
  description: 'Simple, transparent pricing for full access to every opportunity on OppIDX.',
  canonical: `${SITE_URL}/pricing`,
})

// Hidden while the paywall is off (see lib/limits.ts) — full search is free
// for everyone right now, so a live checkout page would be confusing at
// best and a leftover monetization surface at worst. Flip PAYWALL_ENABLED
// back on to bring this back; nothing else needs to change.
export default function PricingPage() {
  if (!PAYWALL_ENABLED) notFound()
  return <PricingClient />
}
