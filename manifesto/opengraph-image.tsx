import { ImageResponse } from 'next/og'

export const alt = 'Opportunities shouldn’t require a rolodex — the OppIDX manifesto'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The manifesto had no share card at all, which is most of why nothing
 * linked to it — a URL that unfurls as a bare blue link doesn't get posted.
 * Deliberately types out the thesis rather than the page title: the sentence
 * itself is the thing worth forwarding.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f3e9cf',
          padding: '68px 76px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: '#a8552e' }} />
          <div style={{ fontSize: 26, fontWeight: 700, color: '#2b2620', letterSpacing: 2 }}>OPPIDX</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: '#2b2620', lineHeight: 1.1, display: 'flex', flexDirection: 'column' }}>
            <span>Opportunities shouldn&apos;t</span>
            <span style={{ color: '#1f3a5c' }}>require a rolodex.</span>
          </div>
          <div style={{ fontSize: 27, color: '#5b5346', lineHeight: 1.4, display: 'flex' }}>
            That&apos;s not a meritocracy. That&apos;s a rolodex.
          </div>
        </div>

        <div style={{ fontSize: 22, color: '#5b5346', display: 'flex' }}>
          Read the manifesto — oppidx.com/manifesto
        </div>
      </div>
    ),
    { ...size }
  )
}
