import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import AdvertiseClient from './AdvertiseClient'

export const metadata: Metadata = pageMetadata({
  title: 'Advertise — OppIDX',
  description: 'Reach students, early-career job seekers, and founders actively searching for their next opportunity.',
  canonical: `${SITE_URL}/advertise`,
})

export default function Page() {
  return <AdvertiseClient />
}
