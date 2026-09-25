import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import SubmitClient from './SubmitClient'

export const metadata: Metadata = pageMetadata({
  title: 'Submit an Opportunity — OppIDX',
  description: 'Know an internship, scholarship, fellowship, grant, or competition worth sharing? Submit it to OppIDX.',
  canonical: `${SITE_URL}/submit`,
})

export default function Page() {
  return <SubmitClient />
}
