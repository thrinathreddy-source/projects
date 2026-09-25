import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'

export const alt = 'OppIDX policy digest'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CREAM = '#f3e9cf'
const SAFFRON = '#a8552e'
const MAROON = '#1f3a5c'
const INK = '#2b2620'
const MUTED = 'rgba(43,38,32,0.68)'

function periodLabel(period: string, periodType: string): string {
  if (periodType === 'weekly') return `Week ${period}`
  const d = new Date(`${period}T00:00:00Z`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function Image({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params
  const digest = await prisma.policyDigest.findUnique({ where: { period } })

  const label = digest ? periodLabel(period, digest.periodType) : 'Policy digest'
  const kind = digest?.periodType === 'weekly' ? 'WEEKLY DIGEST' : 'DAILY DIGEST'
  const summary = digest?.summary ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: CREAM,
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: SAFFRON }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: MAROON, letterSpacing: 3 }}>
            OPPIDX · PULSE
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: SAFFRON, letterSpacing: 2, display: 'flex' }}>
            {kind}
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: INK, lineHeight: 1.15, display: 'flex' }}>
            {label}
          </div>
          {summary && (
            <div style={{ fontSize: 24, color: MUTED, lineHeight: 1.5, display: 'flex' }}>
              {summary.length > 130 ? summary.slice(0, 130) + '…' : summary}
            </div>
          )}
        </div>

        <div style={{ fontSize: 22, color: MAROON, display: 'flex' }}>
          A daily, apolitical read on the country — oppidx.com/pulse
        </div>
      </div>
    ),
    { ...size }
  )
}
