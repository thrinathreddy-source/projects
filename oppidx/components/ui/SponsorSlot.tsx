import { getActiveSponsorSlot, type SponsorSlotType } from '@/lib/sponsor'

/**
 * A paid sponsor card, read on the server. Renders nothing when no slot
 * covers today — so an unsold week costs the page a network round-trip
 * rather than an empty labelled box.
 *
 * Was a client fetch to /api/sponsor/active purely because the whole
 * homepage was a client component; nothing about it needs the browser.
 */
export async function SponsorSlot({ type = 'feed_card' }: { type?: SponsorSlotType }) {
  const sponsor = await getActiveSponsorSlot(type)
  if (!sponsor) return null

  return (
    <a
      href={sponsor.sponsorUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="card-box"
      style={{ display: 'block', padding: '18px 20px', marginBottom: 38, textDecoration: 'none', border: '1.5px solid var(--pin)' }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 8,
      }}>
        Sponsored
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink)', marginBottom: 4 }}>
        {sponsor.sponsorName}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{sponsor.tagline}</div>
    </a>
  )
}
