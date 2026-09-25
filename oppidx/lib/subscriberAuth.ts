import { prisma } from '@/lib/db'
import { createSubscriberSession } from '@/lib/subscriberSession'

/**
 * Bridges a verified Supabase identity (the shared login/signup flow, and
 * the matching account system — same underlying project) to oppidx's
 * existing Subscriber/cookie mechanism. Used by both the shared-signup route
 * and the shared-login route, so there is exactly one implementation of the
 * claim-or-create semantics.
 *
 * If this email already has a Subscriber row (e.g. from an anonymous save or
 * checkout, authUserId still null), that row is claimed rather than
 * duplicated — so previously-saved opportunities and push subscriptions
 * (both keyed by subscriberId) carry over automatically.
 */
export async function linkSubscriberToAuthUser(authUserId: string, email: string) {
  let subscriber = await prisma.subscriber.findUnique({ where: { authUserId } })

  if (!subscriber) {
    subscriber = await prisma.subscriber.upsert({
      where: { email },
      create: { email, authUserId },
      update: { authUserId },
    })
  }

  await createSubscriberSession(subscriber.id)
  return subscriber
}
