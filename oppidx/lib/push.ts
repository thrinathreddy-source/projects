import webpush from 'web-push'
import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/siteUrl'
import { getCollectionDef } from '@/lib/collectionDefs'
import type { MatchInput } from '@/lib/collectionDefs'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (configured) {
  webpush.setVapidDetails('mailto:hello@oppidx.com', VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!)
}

// At most one push per subscriber per window, even if several scrape passes
// in that time each turn up a match — a "new opportunity" ping every hour
// would be worse than no notifications at all.
const NOTIFY_THROTTLE_MS = 6 * 60 * 60 * 1000

/**
 * The scrape cron selects exactly these columns; CollectionDef.match needs
 * the full MatchInput shape, so anything missing from the select would
 * silently make every location- or compensation-scoped collection stop
 * matching rather than error.
 */
export interface NewOpportunity {
  id: string
  audience: string
  tags: string
  org: string | null
  location: string | null
  country: string
  region?: string
  difficulty?: string
  compType?: string | null
}

function toMatchInput(o: NewOpportunity): MatchInput {
  return {
    audience: o.audience,
    tags: o.tags,
    difficulty: o.difficulty ?? '',
    location: o.location,
    region: o.region ?? '',
    country: o.country,
    compType: o.compType ?? null,
  }
}

async function sendTo(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string }
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    )
    return true
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    if (statusCode === 404 || statusCode === 410) {
      // Browser unsubscribed or the push service expired it — stop trying.
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
    } else {
      console.error(`[push] send failed for subscription=${sub.id}:`, err)
    }
    return false
  }
}

/**
 * Pushes newly-added opportunities to the people who actually asked for them.
 *
 * The previous version matched on `audience` alone, against the audiences of
 * everything a subscriber had ever saved. Saving a single student internship
 * therefore signed you up for a ping about every new STUDENT listing on a
 * board that adds dozens a day — technically "personalised", functionally a
 * broadcast, and the fastest way to teach someone to revoke notification
 * permission.
 *
 * Now there are two signals, in priority order:
 *
 *  1. Collections the subscriber explicitly follows (CollectionAlert). These
 *     run the collection's own `match` predicate — the same function that
 *     decides what appears on the collection page — so the notification and
 *     the destination can never disagree, and the message can name the thing
 *     ("3 new in Grants for Founders") and link straight to it.
 *
 *  2. Failing that, the tags of what they've saved, requiring a real tag
 *     overlap rather than an audience match. Still fuzzy, but it's the
 *     difference between "something like the things you chase" and "anything
 *     for students".
 *
 * Never throws: a failed push is cleaned up or logged, never allowed to
 * interrupt the scrape that called it.
 */
export async function notifyMatchingSubscribers(newOpportunities: NewOpportunity[]) {
  if (!configured || newOpportunities.length === 0) return

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) return

  const matchInputs = newOpportunities.map(toMatchInput)

  for (const sub of subscriptions) {
    if (sub.lastNotifiedAt && Date.now() - sub.lastNotifiedAt.getTime() < NOTIFY_THROTTLE_MS) continue

    let payload: { title: string; body: string; url: string } | null = null

    // ── 1. Followed collections ──
    const alerts = await prisma.collectionAlert.findMany({
      where: { subscriberId: sub.subscriberId },
      select: { collectionSlug: true },
    })

    let best: { slug: string; title: string; count: number } | null = null
    for (const alert of alerts) {
      const def = getCollectionDef(alert.collectionSlug)
      if (!def) continue // slug retired in code since it was followed
      const count = matchInputs.filter(m => def.match(m)).length
      if (count > 0 && (!best || count > best.count)) {
        best = { slug: def.slug, title: def.title, count }
      }
    }

    if (best) {
      payload = {
        title: `${best.count} new in ${best.title}`,
        body: best.count === 1
          ? 'One new opportunity just landed in a collection you follow.'
          : `${best.count} new opportunities just landed in a collection you follow.`,
        url: `${SITE_URL}/collections/${best.slug}`,
      }
    } else if (alerts.length === 0) {
      // ── 2. Tag overlap with what they've chased ──
      // Only when they follow nothing: someone who has told us exactly what
      // they want should not also get the fuzzy version.
      const saved = await prisma.savedOpportunity.findMany({
        where: { subscriberId: sub.subscriberId },
        select: { opportunityId: true },
      })
      if (saved.length === 0) continue

      const savedOpps = await prisma.opportunity.findMany({
        where: { id: { in: saved.map(s => s.opportunityId) } },
        select: { tags: true },
      })
      const interestedTags = new Set(
        savedOpps.flatMap(o => o.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))
      )
      if (interestedTags.size === 0) continue

      const matchCount = newOpportunities.filter(o =>
        o.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).some(t => interestedTags.has(t))
      ).length
      if (matchCount === 0) continue

      payload = {
        title: 'New on OppIDX',
        body: `${matchCount} new opportunit${matchCount === 1 ? 'y looks' : 'ies look'} like what you've been chasing.`,
        url: `${SITE_URL}/browse`,
      }
    }

    if (!payload) continue

    const sent = await sendTo(sub, payload)
    if (sent) {
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastNotifiedAt: new Date() } })
    }
  }
}

// How long after applying before it's reasonable to ask how it went. Long
// enough that the honest answer isn't "it's only been a day", short enough
// that the person still remembers.
const NUDGE_AFTER_MS = 21 * 24 * 60 * 60 * 1000
const NUDGE_BATCH = 200

// How often the only caller runs (/api/cron/outcome-nudge, "0 10 * * 2").
//
// This is what keeps a nudge to one per chase. The eligibility test used to be
// open-ended — "applied more than NUDGE_AFTER_MS ago and still no outcome" —
// which is a condition that stays true forever for anyone who never records an
// outcome, so the same chase re-qualified on every weekly run indefinitely. The
// only thing standing in the way was NOTIFY_THROTTLE_MS, which is six hours and
// so had long expired by the next Tuesday. The docstring below promised "never
// nudged before"; the code asked "not in the last six hours".
//
// Bounding the window to exactly one cron period means a chase qualifies in the
// single run after it crosses NUDGE_AFTER_MS, and never again. The trade is
// that a skipped run drops that week's cohort rather than deferring it — much
// the better failure of the two, since the alternative is nagging someone
// weekly forever about an application they have already moved on from.
const NUDGE_CADENCE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Asks people what happened to things they applied to.
 *
 * This is the collection half of the outcome model — without it the schema
 * has somewhere to put proof and no way of ever getting any, since nobody
 * returns to a tracker unprompted to log a rejection. It is also the only
 * notification here that is genuinely about the person rather than the
 * board, which is why it takes priority over new-listing pings.
 *
 * Deliberately narrow: no outcome recorded, and applied inside the single
 * cron period that just crossed NUDGE_AFTER_MS — see NUDGE_CADENCE_MS for why
 * that window is bounded at both ends rather than open-ended. Withdrawn and
 * completed chases are excluded by the `outcome: null` filter.
 */
export async function sendOutcomeNudges() {
  if (!configured) return { candidates: 0, sent: 0 }

  const now = Date.now()
  // Bounded at both ends: older than NUDGE_AFTER_MS, but not older than one
  // more cron period, so each chase falls in exactly one run's window.
  const nudgeableBefore = new Date(now - NUDGE_AFTER_MS)
  const nudgeableAfter = new Date(now - NUDGE_AFTER_MS - NUDGE_CADENCE_MS)
  const stale = await prisma.savedOpportunity.findMany({
    where: { outcome: null, appliedAt: { gte: nudgeableAfter, lte: nudgeableBefore } },
    select: { subscriberId: true, opportunityId: true },
    take: NUDGE_BATCH,
  })
  if (stale.length === 0) return { candidates: 0, sent: 0 }

  // One nudge per person even if several of their chases are stale — being
  // asked four questions at once is how someone turns notifications off.
  const bySubscriber = new Map<string, number>()
  for (const s of stale) bySubscriber.set(s.subscriberId, (bySubscriber.get(s.subscriberId) ?? 0) + 1)

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { subscriberId: { in: [...bySubscriber.keys()] } },
  })

  let sent = 0
  for (const sub of subscriptions) {
    if (sub.lastNotifiedAt && Date.now() - sub.lastNotifiedAt.getTime() < NOTIFY_THROTTLE_MS) continue
    const count = bySubscriber.get(sub.subscriberId) ?? 0
    if (count === 0) continue

    const ok = await sendTo(sub, {
      title: 'How did it go?',
      body: count === 1
        ? 'You applied to something a while back. Did you hear anything?'
        : `You applied to ${count} things a while back. Did you hear anything?`,
      url: `${SITE_URL}/saved`,
    })
    if (ok) {
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastNotifiedAt: new Date() } })
      sent++
    }
  }

  return { candidates: stale.length, sent }
}
