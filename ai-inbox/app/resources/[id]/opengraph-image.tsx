import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/db'

export const alt = 'OppIDX resource'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.resource.findUnique({ where: { id } })

  const title = item?.title ?? 'Resource'
  const category = item?.category ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f5f0e8',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: '#c0432a' }} />
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2b2620', letterSpacing: 2 }}>
            OPPIDX
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {category && (
            <div style={{ fontSize: 26, fontWeight: 700, color: '#c0432a', letterSpacing: 1, textTransform: 'uppercase' }}>
              {category}
            </div>
          )}
          <div style={{ fontSize: 56, fontWeight: 700, color: '#2b2620', lineHeight: 1.15, display: 'flex' }}>
            {title.length > 90 ? title.slice(0, 90) + '…' : title}
          </div>
        </div>

        <div style={{ fontSize: 22, color: '#5b5346', display: 'flex' }}>
          A verified resource — oppidx.com/resources
        </div>
      </div>
    ),
    { ...size }
  )
}
