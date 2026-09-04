import { listOrEmpty } from '@/lib/buildParams'
import { prisma } from '@/lib/db'
import { getCurrentPaidSubscriber } from '@/lib/subscriberSession'
import { FREE_SEARCH_LIMIT, PAYWALL_ENABLED } from '@/lib/limits'
import { REGION_ORDER, slugifyRegion } from '@/lib/regionDefs'
import type { Opportunity } from '@/types'

export { REGION_ORDER, slugifyRegion, regionBlurb } from '@/lib/regionDefs'

// Below this, a region page would look thin — same reasoning and same
// mechanism as MIN_LISTINGS_FOR_PAGE in lib/companies.ts. Unlike the
// company/country thresholds in lib/collectionDefs.ts (checked once against
// a live count and hard-coded), this is computed fresh on every call —
// there's no reliable one-time "real count" for something this coarse-
// grained to hard-code against, and it costs nothing extra to just ask.
const MIN_LISTINGS_FOR_PAGE = 5

const REGION_SLUGS = new Map(REGION_ORDER.map(r => [slugifyRegion(r), r]))

/** Every region with enough real listings to earn its own page, in the
 * site's canonical region order. */
export async function getRegionList(): Promise<{ region: string; slug: string; count: number; newest: Date | null }[]> {
  return listOrEmpty('getRegionList', async () => {
  const rows = await prisma.opportunity.groupBy({
    by: ['region'],
    where: { verified: true, deletedAt: null, region: { in: REGION_ORDER } },
    _count: { _all: true },
    // Newest listing per region, for app/sitemap.ts's `lastModified` — same
    // reasoning as lib/companies.ts.
    _max: { addedAt: true },
  })

  const byName = new Map(rows.map(r => [r.region, r._count._all]))
  const newestByName = new Map(rows.map(r => [r.region, r._max.addedAt]))
  return REGION_ORDER
    .filter(r => (byName.get(r) ?? 0) >= MIN_LISTINGS_FOR_PAGE)
    .map(r => ({ region: r, slug: slugifyRegion(r), count: byName.get(r)!, newest: newestByName.get(r) ?? null }))
  })
}

export async function getRegionOpportunities(slug: string) {
  const region = REGION_SLUGS.get(slug)
  if (!region) return null

  const paidSubscriber = PAYWALL_ENABLED ? await getCurrentPaidSubscriber() : true
  const rows = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, region },
    orderBy: { addedAt: 'desc' },
  })
  if (rows.length < MIN_LISTINGS_FOR_PAGE) return null

  const total = rows.length
  const capped = paidSubscriber ? rows : rows.slice(0, FREE_SEARCH_LIMIT)
  const items = capped.map(r => ({ ...r, addedAt: r.addedAt.toISOString() })) as unknown as Opportunity[]
  const restricted = !paidSubscriber && total > items.length

  return { region, items, total, restricted }
}
