import { listOrEmpty } from '@/lib/buildParams'
import { prisma } from '@/lib/db'
import { getCurrentPaidSubscriber } from '@/lib/subscriberSession'
import { FREE_SEARCH_LIMIT, PAYWALL_ENABLED } from '@/lib/limits'
import type { Opportunity } from '@/types'

// Below this, a company page would look thin — better to leave it out of
// the index/sitemap than publish a page with one or two listings on it.
// Checked against the real DB before picking this number: 96 companies
// clear it today, out of 1,013 distinct employers on the board.
const MIN_LISTINGS_FOR_PAGE = 3

export function slugifyCompany(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Every company with enough real listings to earn its own page, most-listed first. */
export async function getCompanyList(): Promise<{ org: string; slug: string; count: number; newest: Date | null }[]> {
  return listOrEmpty('getCompanyList', async () => {
  const rows = await prisma.opportunity.groupBy({
    by: ['org'],
    where: { verified: true, deletedAt: null, org: { not: null } },
    _count: { _all: true },
    // Newest listing per company, for app/sitemap.ts's `lastModified`. Free —
    // the same aggregate pass that already computes _count.
    _max: { addedAt: true },
  })

  return rows
    .filter(r => r.org && r._count._all >= MIN_LISTINGS_FOR_PAGE)
    .map(r => ({ org: r.org!, slug: slugifyCompany(r.org!), count: r._count._all, newest: r._max.addedAt }))
    .sort((a, b) => b.count - a.count)
  })
}

/** Resolves a URL slug back to the real org name it was derived from — slugs
 * are computed on the fly (no stored column), so this re-slugifies every
 * distinct org and finds the match, same approach as the getCompanyList sort.
 *
 * Two distinct org names can slugify to the same string (slugifyCompany
 * strips all non-alphanumerics, so "AT&T" and "At-T" both become "at-t") —
 * rather than letting `.find()` pick one arbitrarily and silently swallow
 * the other org's listings, every org sharing the slug is merged into one
 * page. Collisions are rare (not triggered by the current dataset) but
 * "one company vanishes with no error" is worse than "two rare namesakes
 * share a page", so this fails toward visibility. */
export async function getCompanyOpportunities(slug: string) {
  const distinctOrgs = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, org: { not: null } },
    distinct: ['org'],
    select: { org: true },
  })
  const matches = distinctOrgs.filter(r => r.org && slugifyCompany(r.org) === slug).map(r => r.org!)
  if (matches.length === 0) return null

  const paidSubscriber = PAYWALL_ENABLED ? await getCurrentPaidSubscriber() : true
  const rows = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, org: { in: matches } },
    orderBy: { addedAt: 'desc' },
  })
  if (rows.length < MIN_LISTINGS_FOR_PAGE) return null

  const total = rows.length
  const capped = paidSubscriber ? rows : rows.slice(0, FREE_SEARCH_LIMIT)
  const items = capped.map(r => ({ ...r, addedAt: r.addedAt.toISOString() })) as unknown as Opportunity[]
  const restricted = !paidSubscriber && total > items.length

  // Display name: the org with the most listings among those sharing this
  // slug — arbitrary among ties, but deterministic and reasonable.
  const displayOrg = matches.length === 1 ? matches[0]
    : matches.reduce((best, org) => rows.filter(r => r.org === org).length > rows.filter(r => r.org === best).length ? org : best)

  return { org: displayOrg, items, total, restricted }
}
