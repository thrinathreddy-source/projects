import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/** POST /api/push/unsubscribe — removes a browser's push subscription.
 * No-op (still ok:true) if it wasn't registered. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required.' }, { status: 400 })

  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
  return NextResponse.json({ ok: true })
}
