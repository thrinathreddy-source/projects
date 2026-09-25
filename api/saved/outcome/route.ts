import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { getClientIp } from '@/lib/ip'
import { getCurrentSubscriber } from '@/lib/subscriberSession'
import { isOutcome, OUTCOME_NOTE_MAX } from '@/lib/outcomes'

/**
 * POST /api/saved/outcome — record what happened to something you chased.
 *
 * Only ever writes a row this subscriber already owns, and only ever with a
 * value they picked. Nothing here infers an outcome from behaviour: a click
 * on Apply sets appliedAt (see app/api/opportunities/[id]/view/route.ts) and
 * that is as far as inference goes. Whether it worked is not something this
 * site can observe, so it asks.
 *
 * Send outcome: null to clear a mistake — a tracker you can't correct stops
 * being used the first time someone mis-taps.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`outcome-write:${getClientIp(req)}`, 60_000, 30)
  if (!rl.ok) return NextResponse.json({ error: 'Slow down.' }, { status: 429 })

  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ error: 'No active session.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const opportunityId = typeof body?.opportunityId === 'string' ? body.opportunityId : ''
  if (!opportunityId) return NextResponse.json({ error: 'opportunityId is required.' }, { status: 400 })

  const clearing = body?.outcome === null
  if (!clearing && !isOutcome(body?.outcome)) {
    return NextResponse.json({ error: 'Unknown outcome.' }, { status: 400 })
  }

  const rawNote = typeof body?.note === 'string' ? body.note.trim() : ''
  if (rawNote.length > OUTCOME_NOTE_MAX) {
    return NextResponse.json({ error: `Keep it under ${OUTCOME_NOTE_MAX} characters.` }, { status: 400 })
  }

  // Consent is only meaningful attached to an outcome. Clearing the outcome
  // clears the consent with it, so a re-entered outcome is never silently
  // published under permission given for a previous one.
  const shareConsent = clearing ? false : body?.shareConsent === true

  // updateMany scoped by subscriberId, not update-by-id: this is the whole
  // authorization check. A request naming someone else's row matches nothing
  // and updates nothing, rather than needing a separate ownership lookup.
  const result = await prisma.savedOpportunity.updateMany({
    where: { subscriberId: subscriber.id, opportunityId },
    data: clearing
      ? { outcome: null, outcomeAt: null, outcomeNote: null, shareConsent: false }
      : { outcome: body.outcome, outcomeAt: new Date(), outcomeNote: rawNote || null, shareConsent },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "You haven't chased this one." }, { status: 404 })
  }

  // Reporting an outcome other than "withdrew" means they did apply, even if
  // the Apply click was never registered here (applied from the source's own
  // site, or on another device). Backfilled as a *separate* update scoped to
  // appliedAt: null — folding it into the update above would overwrite a real,
  // earlier applied date with today's on every subsequent edit of the note or
  // the consent tick, quietly destroying the one timestamp that makes
  // "saved → applied" measurable.
  if (!clearing && body.outcome !== 'withdrew') {
    await prisma.savedOpportunity.updateMany({
      where: { subscriberId: subscriber.id, opportunityId, appliedAt: null },
      data: { appliedAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true })
}
