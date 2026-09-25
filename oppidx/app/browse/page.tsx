import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import { BrowseIndex } from '@/components/ui/BrowseIndex'
import BrowseClient from './BrowseClient'

export const metadata: Metadata = pageMetadata({
  title: 'Browse Opportunities — OppIDX',
  description: 'Search and filter every internship, scholarship, fellowship, grant, and competition on OppIDX by audience, region, difficulty, and more.',
  canonical: `${SITE_URL}/browse`,
})

export default function Page() {
  return (
    <>
      <BrowseClient />
      {/* Server-rendered, below the client search. BrowseClient's results only
          exist after hydration, so without this the site's second-highest-
          priority URL served crawlers an empty document with no outbound
          links. See components/ui/BrowseIndex.tsx. */}
      <div className="page-shell" style={{ padding: '0 var(--gutter) 70px' }}>
        <BrowseIndex />
      </div>
    </>
  )
}
