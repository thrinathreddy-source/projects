import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/db'
import { requireAuth }  from '@/lib/auth'

/** GET /api/admin/subscribers — admin-only: full subscriber list with live billing status. */
export async function GET() {
  const admin = await requireAuth()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscribers = await prisma.subscriber.findMany({
    orderBy: { subscribedAt: 'desc' },
  })

  return NextResponse.json({ subscribers })
}
