import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import WidgetClient from './WidgetClient'

export const metadata: Metadata = pageMetadata({
  title: 'Embed the Opportunity Widget — OppIDX',
  description: 'Add a live, always-updating Opportunity of the Day widget to your own site or newsletter — free, one snippet, powered by OppIDX.',
  canonical: `${SITE_URL}/widget`,
})

export default function Page() {
  return <WidgetClient />
}
