import { NextRequest, NextResponse } from 'next/server'
import { getActiveSponsorSlot, type SponsorSlotType } from '@/lib/sponsor'

/**
 * GET /api/sponsor/active?type=sidebar|feed_card — public. Whichever
 * SponsoredSlot (if any) of that type covers today. Defaults to "sidebar"
 * — the original, only placement this endpoint was built for — so the
 * homepage credit line keeps working unchanged; the feed card is the new
 * type opting into a different, more prominent placement.
 */
export async function GET(req: NextRequest) {
  const typeParam = req.nextUrl.searchParams.get('type')
  const type: SponsorSlotType = typeParam === 'feed_card' ? 'feed_card' : 'sidebar'

  const sponsor = await getActiveSponsorSlot(type)
  if (!sponsor) return NextResponse.json({ sponsor: null })
  return NextResponse.json({
    sponsor: { sponsorName: sponsor.sponsorName, sponsorUrl: sponsor.sponsorUrl, tagline: sponsor.tagline },
  })
}
