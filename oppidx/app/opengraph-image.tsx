import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const alt = 'OppIDX'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logoData = readFileSync(join(process.cwd(), 'public/logo.png'))
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#f5f0e8',
          fontFamily: 'sans-serif',
          gap: 26,
        }}
      >
        { }
        <img src={logoSrc} width={120} height={120} alt="" />
        <div style={{ fontSize: 56, fontWeight: 700, color: '#2b2620', letterSpacing: 3, display: 'flex' }}>
          OppIDX
        </div>
        <div style={{ fontSize: 28, color: '#5b5346', textAlign: 'center', display: 'flex' }}>
          Building a genuine generation.
        </div>
      </div>
    ),
    { ...size }
  )
}
