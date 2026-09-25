import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { pageMetadata } from '@/lib/pageMetadata'
import { SITE_URL } from '@/lib/siteUrl'
import { supabaseAdmin } from '@/lib/platform/supabase'
import EventClient from './EventClient'

// Deduped across generateMetadata and the page below, which both need it —
// React cache() dedupes per request the way Next dedupes fetch(), which a
// raw supabase-js call doesn't get on its own.
//
// Now that a null result drives notFound() (i.e. a real 404), "this event
// does not exist" has to be distinguished from "we couldn't reach the
// database". supabase-js resolves rather than throws on failure, so
// ignoring `error` and testing `data` alone would turn any outage — or a
// missing SUPABASE_SERVICE_ROLE_KEY — into a 404 on every event URL, and a
// 404 is the one status that tells Google to drop pages it has already
// indexed. Only PGRST116 ("no rows returned" from .single()) is a genuine
// absence; anything else throws, so the request fails as a 500 and the
// crawler retries instead.
const getEvent = cache(async (slug: string) => {
  if (!supabaseAdmin) throw new Error('Supabase is not configured (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing).')
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('title, description, location, event_time, is_published')
    .eq('slug', slug)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(`Event lookup failed for "${slug}": ${error.message}`)
  // An unpublished event is a real absence, not an error — same as no row.
  if (!data || !data.is_published) return null
  return data
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Event — OppIDX', robots: { index: false, follow: true } }

  const when = new Date(event.event_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return pageMetadata({
    title: `${event.title} — OppIDX`,
    description: `${event.description.slice(0, 130)} — ${when}, ${event.location}.`.slice(0, 160),
    canonical: `${SITE_URL}/events/${slug}`,
    image: 'route', // app/events/[slug]/opengraph-image.tsx
  })
}

// The body is client-rendered (EventClient fetches /api/events/[slug] for
// live RSVP counts), but existence has to be settled on the server: without
// this check a missing or unpublished slug rendered EventClient's own error
// state on a 200, so every de-listed event in the sitemap read to Google as
// a real page. The lookup is deduped with generateMetadata's, so this costs
// no extra query, and it resolves before anything streams — see the note in
// app/not-found.tsx about why nothing may suspend above this point.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) notFound()

  return <EventClient />
}
