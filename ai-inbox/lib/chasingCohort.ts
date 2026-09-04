import { prisma } from '@/lib/db'

/**
 * "N others chasing this" and the real matchmaking behind it — bridges
 * SavedOpportunity (Prisma/Turso, keyed by Subscriber) to the matching side's
 * profile pool (Supabase, keyed by the shared Supabase-auth identity) via
 * Subscriber.authUserId, set once a subscriber has gone through the
 * shared signup/login flow (lib/subscriberAuth.ts). A subscriber who's
 * only ever saved opportunities anonymously has no authUserId and never
 * counts toward this — there's no profile to match them against, so
 * counting them would be exactly the kind of stretched, fake-looking
 * number the rest of this codebase refuses to show.
 */
const CHASING_MIN = 2 // a match needs a pair — matches STAT_THRESHOLDS.chasing

async function linkedSubscriberAuthIds(opportunityId: string): Promise<string[]> {
  const saves = await prisma.savedOpportunity.findMany({
    where: { opportunityId },
    select: { subscriberId: true },
  })
  if (saves.length < CHASING_MIN) return []

  const subscribers = await prisma.subscriber.findMany({
    where: { id: { in: saves.map(s => s.subscriberId) }, authUserId: { not: null } },
    select: { authUserId: true },
  })
  return subscribers.map(s => s.authUserId!).filter(Boolean)
}

/** The honest count for a card's attachment strip — Prisma-only, always
 * safe to call, no Supabase dependency. Batched per-opportunity by the
 * caller the same way lib/opportunityStats.ts batches saves/applied. */
export async function chasingCohortSize(opportunityId: string): Promise<number> {
  const userIds = await linkedSubscriberAuthIds(opportunityId)
  return userIds.length >= CHASING_MIN ? userIds.length : 0
}

/** Same thing, for a whole page of opportunities in two queries total
 * instead of two-per-card — the version lib/feedEnrichment.ts actually
 * calls. */
export async function chasingCohortSizes(opportunityIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const id of opportunityIds) result[id] = 0
  if (opportunityIds.length === 0) return result

  const saves = await prisma.savedOpportunity.findMany({
    where: { opportunityId: { in: opportunityIds } },
    select: { opportunityId: true, subscriberId: true },
  })
  if (saves.length === 0) return result

  const linkedSubscribers = await prisma.subscriber.findMany({
    where: { id: { in: [...new Set(saves.map(s => s.subscriberId))] }, authUserId: { not: null } },
    select: { id: true },
  })
  const linkedIds = new Set(linkedSubscribers.map(s => s.id))

  const perOpportunity = new Map<string, number>()
  for (const s of saves) {
    if (!linkedIds.has(s.subscriberId)) continue
    perOpportunity.set(s.opportunityId, (perOpportunity.get(s.opportunityId) ?? 0) + 1)
  }
  for (const [id, count] of perOpportunity) {
    result[id] = count >= CHASING_MIN ? count : 0
  }
  return result
}

/**
 * Every opportunity with a real chasing cohort right now — the Friday
 * cron's entry point (app/api/match/find/route.ts), not scoped to
 * a single page like chasingCohortSizes. Only opportunities that clear
 * CHASING_MIN linked, real subscribers come back — same rule as
 * everywhere else in this file.
 */
export async function opportunitiesWithChasingCohorts(): Promise<Array<{ opportunityId: string; title: string; userIds: string[] }>> {
  const saves = await prisma.savedOpportunity.findMany({
    select: { opportunityId: true, subscriberId: true },
  })
  if (saves.length === 0) return []

  const subscriberIds = [...new Set(saves.map(s => s.subscriberId))]
  const linked = await prisma.subscriber.findMany({
    where: { id: { in: subscriberIds }, authUserId: { not: null } },
    select: { id: true, authUserId: true },
  })
  const linkedAuthId = new Map(linked.map(s => [s.id, s.authUserId!]))
  if (linkedAuthId.size === 0) return []

  const byOpportunity = new Map<string, Set<string>>()
  for (const s of saves) {
    const userId = linkedAuthId.get(s.subscriberId)
    if (!userId) continue
    const set = byOpportunity.get(s.opportunityId) ?? new Set<string>()
    set.add(userId)
    byOpportunity.set(s.opportunityId, set)
  }

  const eligible = [...byOpportunity.entries()].filter(([, ids]) => ids.size >= CHASING_MIN)
  if (eligible.length === 0) return []

  const opportunities = await prisma.opportunity.findMany({
    where: { id: { in: eligible.map(([id]) => id) } },
    select: { id: true, title: true },
  })
  const titleById = new Map(opportunities.map(o => [o.id, o.title]))

  return eligible.map(([opportunityId, ids]) => ({
    opportunityId,
    title: titleById.get(opportunityId) ?? 'this opportunity',
    userIds: [...ids],
  }))
}

/**
 * The real profile pool for one opportunity's cohort — is_active and
 * not yet matched this week, same eligibility rule the main weekly pool
 * uses. Used by the Friday cron (app/api/match/find/route.ts),
 * which groups this by looking_for and runs the real matcher over it,
 * same as it already does for the main pool.
 */
export async function chasingCohortProfilePool(userIds: string[]) {
  const { supabaseAdmin } = await import('@/lib/platform/supabase')
  if (!supabaseAdmin) return []

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, looking_for, profile_json, contact_encrypted, contact_type, users!inner(name, gender, dob, city, religion, mother_tongue, profession, height)')
    .in('user_id', userIds)
    .eq('is_active', true)
    .eq('matched', false)

  if (error || !profiles) return []

  // Shape of the .select() above. Spelled out because supabase-js can't infer
  // column lists without generated database types, which this project doesn't
  // build. `users` is the !inner join: supabase-js types embedded relations as
  // an array, but returns a bare object for a to-one join, hence the runtime
  // check below — the union keeps both cases honest.
  type JoinedUser = {
    name: string | null
    gender: string | null
    dob: string | null
    city: string | null
    religion: string | null
    mother_tongue: string | null
    profession: string | null
    height: string | null
  }
  type ProfileRow = {
    id: string
    user_id: string
    // looking_for/profile_json/contact_encrypted/contact_type are all `not
    // null` on public.profiles (supabase-schema.sql), which is what lets this
    // satisfy MatchProfile without a cast at the call site.
    looking_for: string
    profile_json: Record<string, string>
    contact_encrypted: string
    contact_type: string
    users: JoinedUser | JoinedUser[] | null
  }

  return (profiles as ProfileRow[]).map(p => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users
    return {
    id: p.id,
    user_id: p.user_id,
    looking_for: p.looking_for,
    profile_json: p.profile_json,
    contact_encrypted: p.contact_encrypted,
    contact_type: p.contact_type,
    name: u?.name ?? '',
    gender: u?.gender ?? null,
    dob: u?.dob ?? null,
    city: u?.city ?? null,
    religion: u?.religion ?? null,
    mother_tongue: u?.mother_tongue ?? null,
    profession: u?.profession ?? null,
    height: u?.height ?? null,
    }
  })
}
