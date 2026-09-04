import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * Metadata carrier for a client-component page — same reason as
 * app/match/compatibility/layout.tsx.
 *
 * `noindex` here, and only here, because this route is the multi-step intake
 * form itself rather than a page that describes anything. Someone arriving on
 * it cold from a search result lands mid-flow with no explanation of what they
 * are joining; /match/philosophy and /match/compatibility are the pages that
 * do that job, and both are indexable. `follow` is kept so the links out of
 * this page still carry, and it stays out of the sitemap for the same reason.
 */
export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Join the matching pool — OppIDX',
    description: 'The intake interview for OppIDX matching. Answer honestly; introductions run once a week.',
    canonical: `${SITE_URL}/match/interview`,
  }),
  robots: { index: false, follow: true },
}

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return children
}
