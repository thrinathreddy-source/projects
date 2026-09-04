import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import ResourcesClient from './ResourcesClient'

export const metadata: Metadata = pageMetadata({
  title: 'Resources — OppIDX',
  description: 'Prep guides, application resources, and gatherings for students, early-career job seekers, and founders chasing internships, scholarships, and fellowships.',
  canonical: `${SITE_URL}/resources`,
})

export default function Page() {
  return <ResourcesClient />
}
