import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/siteUrl'
import { FREE_SEARCH_LIMIT } from '@/lib/limits'
import { opportunityPath } from '@/lib/slug'

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * GET /feed.xml — public RSS 2.0 feed of the most recently added, verified
 * opportunities. Lets independent newsletter writers / community admins pull
 * new listings into their own channels automatically, no API key needed.
 *
 * Capped at FREE_SEARCH_LIMIT — same free-tier cap as /browse — so this
 * doesn't become an unauthenticated back door around the paywall.
 */
export async function GET() {
  const items = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null },
    orderBy: { addedAt: 'desc' },
    take: FREE_SEARCH_LIMIT,
  })

  const rssItems = items.map(o => `
    <item>
      <title>${escapeXml(o.title)}</title>
      <link>${SITE_URL}${opportunityPath(o)}</link>
      <guid isPermaLink="true">${SITE_URL}${opportunityPath(o)}</guid>
      <pubDate>${o.addedAt.toUTCString()}</pubDate>
      <description>${escapeXml(o.description.slice(0, 500))}</description>
    </item>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>OppIDX — the opportunity board</title>
    <link>${SITE_URL}</link>
    <description>Every real opportunity, one honest board — internships, scholarships, fellowships, grants, and competitions.</description>
    <language>en-us</language>
    ${rssItems}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
