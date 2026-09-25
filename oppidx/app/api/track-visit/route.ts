import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const COOKIE = 'oppidx_vid'
const MAX_AGE = 60 * 60 * 24 * 400 // ~400 days — long enough to see real return behavior

/**
 * POST /api/track-visit — anonymous, first-party return-visit signal.
 * anonId never touches an email, account, or IP; this exists purely to
 * answer "does the same visitor come back on a later day," the one
 * retention metric the site didn't previously measure at all.
 */
export async function POST(req: NextRequest) {
  const existing = req.cookies.get(COOKIE)?.value
  const anonId = existing || randomUUID()
  const date = new Date().toISOString().slice(0, 10)

  try {
    await prisma.visitLog.upsert({
      where: { anonId_date: { anonId, date } },
      create: { anonId, date },
      update: {},
    })
  } catch (e) {
    console.error('[track-visit] failed:', e)
  }

  const res = NextResponse.json({ ok: true })
  if (!existing) {
    res.cookies.set(COOKIE, anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    })
  }
  return res
}
