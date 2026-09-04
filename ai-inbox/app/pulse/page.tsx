import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import PulseClient from './PulseClient'

export const metadata: Metadata = pageMetadata({
  title: 'Pulse — Policy & Industry News — OppIDX',
  description: 'The policy, visa, and industry news that actually affects your job search — tracked and digested so you don’t have to.',
  canonical: `${SITE_URL}/pulse`,
})

export default function Page() {
  return <PulseClient />
}
