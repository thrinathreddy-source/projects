import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/** GET /api/opportunities/facets — public. Real region/country values that
 * currently have at least one verified, non-deleted listing — so the browse
 * page only ever shows filter options that actually return results. */
export async function GET() {
  const [regions, countries] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ['region'],
      where: { deletedAt: null, verified: true, region: { not: '' } },
      _count: true,
      orderBy: { _count: { region: 'desc' } },
    }),
    prisma.opportunity.groupBy({
      by: ['country'],
      where: { deletedAt: null, verified: true, country: { not: '' } },
      _count: true,
      orderBy: { _count: { country: 'desc' } },
    }),
  ])

  return NextResponse.json({
    regions: regions.map(r => ({ value: r.region, count: r._count })),
    countries: countries.map(c => ({ value: c.country, count: c._count })),
  })
}
