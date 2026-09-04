import { prisma } from '@/lib/db'

export type SponsorSlotType = 'sidebar' | 'feed_card'

/**
 * Whichever SponsoredSlot (if any) of the given type covers today — there's
 * no enforcement against overlapping bookings within a type since these are
 * created by hand, one at a time, by whoever runs OppIDX; just takes the
 * first match. Returns null (not an error) when nothing's booked, which is
 * the normal case. Defaults to "sidebar" — the original, only placement
 * this model was built for — so existing callers don't need to change.
 */
export async function getActiveSponsorSlot(type: SponsorSlotType = 'sidebar') {
  const now = new Date()
  return prisma.sponsoredSlot.findFirst({
    where: { type, startDate: { lte: now }, endDate: { gte: now } },
    orderBy: { startDate: 'desc' },
  })
}
