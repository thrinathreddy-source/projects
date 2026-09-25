import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { getCurrentSubscriber, createSubscriberSession } from '@/lib/subscriberSession'
import { isUniqueConstraintError } from '@/lib/isUniqueConstraintError'
import { listComments, addComment } from '@/lib/comments'
import { checkContentSafety } from '@/lib/platform/moderation'

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320
}

/** GET /api/opportunities/[id]/comments — public, newest last (read top to
 * bottom like a thread). No subscriber identity is exposed, just the
 * comment body and when it was posted — nobody browsing needs to know
 * who anybody else is to read a discussion. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const comments = await listComments('opportunity', id)
  return NextResponse.json({
    items: comments.map(c => ({ id: c.id, body: c.body, createdAt: c.createdAt })),
  })
}

/**
 * POST /api/opportunities/[id]/comments — same lightweight identity model
 * as saves (see app/api/saved/route.ts): a subscriber session if one
 * exists, otherwise an email creates one on the spot. Posting a comment is
 * exactly as much commitment as saving something — no reason to ask for
 * more here than the rest of the site already does.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rl = rateLimit(`comment-write:${getClientIp(req)}`, 60_000, 10)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const opp = await prisma.opportunity.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
  if (!opp || opp.deletedAt) return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Keep it under 2000 characters.' }, { status: 400 })

  // Same keyword-based screen used at account registration — this is a
  // public, unmoderated-until-now surface, so it gets the same floor
  // every other public free-text field on the site already has.
  const safety = await checkContentSafety([text])
  if (safety.flagged) {
    return NextResponse.json({ error: 'That comment can\'t be posted — try rewording it.' }, { status: 400 })
  }

  let subscriber = await getCurrentSubscriber()

  if (!subscriber) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!isPlausibleEmail(email)) {
      return NextResponse.json({ error: 'needsEmail' }, { status: 401 })
    }
    try {
      subscriber = await prisma.subscriber.create({ data: { email } })
    } catch (e) {
      if (!isUniqueConstraintError(e)) throw e
      subscriber = await prisma.subscriber.findUniqueOrThrow({ where: { email } })
    }
    await createSubscriberSession(subscriber.id)
  }

  const comment = await addComment('opportunity', id, subscriber.id, text)
  return NextResponse.json({ item: { id: comment.id, body: comment.body, createdAt: comment.createdAt } })
}
