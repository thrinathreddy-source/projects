import { memo } from 'react'
import Link from 'next/link'

export interface UpcomingEvent {
  slug: string
  title: string
  description: string
  category: string
  location: string
  event_time: string
  host_name: string
  capacity: number | null
  rsvpCount: number
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** A real, upcoming gathering (see app/api/events/list) interleaved into the
 * opportunities feed — same rationale as PulseCard: Events doesn't get its
 * own tab, it shows up where people are already scrolling.
 *
 * Wrap in <AnimatedCard> where it genuinely animates (/browse). It used to
 * wrap itself, which put framer-motion in the bundle of every page that
 * shows a feed — including the homepage, where nothing here ever moves —
 * and started the card at opacity 0 so the grid arrived blank and faded in. */
export const EventCard = memo(function EventCard({ event }: { event: UpcomingEvent }) {
  return (
    <Link href={`/events/${event.slug}`} className="card-box" style={{ display: 'flex', overflow: 'hidden', textDecoration: 'none' }}>
        <div style={{ width: 5, flex: 'none', background: 'var(--pin)' }} />
        <div style={{ padding: '16px 18px', flex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
            color: 'var(--pin)', fontFamily: 'var(--font-mono)',
          }}>
            📍 Event · {whenLabel(event.event_time)}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, lineHeight: 1.4, color: 'var(--ink)', marginBottom: 6,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {event.title}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10 }}>
            {event.location}{event.rsvpCount > 0 ? ` · ${event.rsvpCount} going` : ''}
          </div>
          <span style={{
            display: 'inline-block', fontSize: 11.5, fontWeight: 700, color: 'var(--pin)',
            border: '1.5px solid var(--pin)', borderRadius: 2, padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
          }}>
            RSVP →
          </span>
        </div>
    </Link>
  )
})
