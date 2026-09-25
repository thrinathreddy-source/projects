/**
 * Maps an opportunity's tags/audience to real, published, upcoming
 * gatherings worth surfacing on its card — the third graph edge, after
 * Opportunities→Resources (lib/opportunityResourceMap.ts) and
 * Pulse→Opportunities (lib/platform/pulseOpportunityMap.ts). Same rule as
 * both: a narrow keyword match, nothing if nothing's genuinely relevant —
 * never a stretched match just to fill the card.
 *
 * Crosses into the events Supabase project rather than the Prisma/Turso
 * database the rest of this file's siblings query — deliberately isolated
 * behind a dynamic import wrapped in try/catch, since Supabase's client
 * throws at construction time (not call time) when its env vars are
 * missing, e.g. in a local environment that only has the Turso/Prisma side
 * configured. A missing or unreachable events project degrades to "no
 * gatherings," never a crash.
 */
export interface Gathering {
  slug: string
  title: string
  location: string
  eventTime: string
}

function gatheringKeywords(opp: { tags: string; audience: string }): string[] {
  const keywords = new Set<string>()
  for (const raw of opp.tags.split(',')) {
    const t = raw.trim().toLowerCase()
    if (t.length >= 4) keywords.add(t) // skip tiny/ambiguous tags ("ai", "hr")
  }
  if (opp.audience === 'FOUNDER') keywords.add('startup')
  if (opp.audience === 'STUDENT') keywords.add('student')
  return [...keywords].slice(0, 5) // keep the OR filter small and specific
}

/** One Supabase query for the whole page of cards, not one per card — the
 * upcoming-events pool is small, so matching happens in memory afterward
 * (see matchGatheringsFromPool) instead of round-tripping per opportunity. */
export async function fetchUpcomingGatheringsPool(): Promise<Array<Gathering & { haystack: string }>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const { supabaseAdmin } = await import('@/lib/platform/supabase')
    if (!supabaseAdmin) return []

    const { data, error } = await supabaseAdmin
      .from('events')
      .select('slug, title, description, category, location, event_time')
      .eq('is_published', true)
      .gt('event_time', new Date().toISOString())
      .order('event_time', { ascending: true })
      .limit(50)

    if (error || !data) return []
    // Shape of the .select() above. Spelled out because supabase-js can't infer
    // column lists without generated database types, which this project doesn't
    // build.
    // `location` is `text not null` in supabase-schema-events.sql, matching
    // what Gathering expects.
    type EventRow = {
      slug: string
      title: string
      description: string | null
      category: string | null
      location: string
      event_time: string
    }
    return (data as EventRow[]).map(e => ({
      slug: e.slug, title: e.title, location: e.location, eventTime: e.event_time,
      haystack: `${e.title} ${e.description} ${e.category}`.toLowerCase(),
    }))
  } catch {
    return []
  }
}

export function matchGatheringsFromPool(
  opp: { tags: string; audience: string },
  pool: Array<Gathering & { haystack: string }>
): Gathering[] {
  const keywords = gatheringKeywords(opp)
  if (keywords.length === 0 || pool.length === 0) return []
  return pool.filter(e => keywords.some(k => e.haystack.includes(k))).slice(0, 3)
}
