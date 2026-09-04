import { ImageResponse } from 'next/og'

const CREAM = '#f5f0e8'
const CARD = '#faf6ee'
const PIN = '#c0432a'
const INK = '#2b2620'
const MUTED = '#5b5346'

function clamp(v: string | null, max: number): string {
  if (!v) return ''
  return v.slice(0, max)
}

// satori/next-og text nodes never auto-wrap, so a long title needs manual
// line breaks or it runs off the edge of the card.
function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (test.length > maxCharsPerLine && current) {
      lines.push(current)
      current = w
      if (lines.length === maxLines) break
    } else {
      current = test
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  const consumedWords = lines.join(' ').split(/\s+/).length
  if (consumedWords < words.length) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`
  }
  return lines
}

/**
 * GET /api/saved/card — a shareable "I'm chasing" story card built purely
 * from query params the client already has (its own saved-opportunities
 * list) — no account/profile system needed, and nothing is persisted or
 * publicly viewable at a stable URL. Mirrors the same pattern already
 * proven for the "I'm going" event card.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const titles = searchParams.getAll('title').slice(0, 3).map(t => clamp(t, 70))
  const total = Math.max(Number(searchParams.get('total')) || titles.length, titles.length)
  const extra = total - titles.length
  // Momentum, not just a static list — only shown when genuinely > 0, since
  // "0 applied" isn't a stat worth putting on a card.
  const applied = Math.max(0, Number(searchParams.get('applied')) || 0)

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: CREAM, alignItems: 'center', justifyContent: 'center', padding: 64 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: CARD, border: `6px solid ${PIN}`, borderRadius: 14, alignItems: 'center', justifyContent: 'space-between', padding: 60 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 18, height: 18, borderRadius: 999, background: PIN }} />
              <div style={{ fontSize: 28, fontWeight: 700, color: INK, letterSpacing: 4 }}>OPPIDX</div>
            </div>
            <div style={{ display: 'flex', fontSize: 42, color: INK, fontWeight: 700, marginTop: 30 }}>I&apos;m chasing</div>
            {applied > 0 && (
              <div style={{ display: 'flex', fontSize: 24, color: PIN, fontWeight: 700, marginTop: 14 }}>
                {applied} applied to so far
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
            {titles.map((title, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {wrapLines(title, 28, 2).map((line, j) => (
                  <div key={j} style={{ display: 'flex', fontSize: 32, color: PIN, fontWeight: 700, textAlign: 'center' }}>
                    {line}
                  </div>
                ))}
              </div>
            ))}
            {extra > 0 && (
              <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>+ {extra} more on my list</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: 22, color: MUTED, marginBottom: 6 }}>
              Real, hand-verified opportunities — no hype, no fake urgency
            </div>
            <div style={{ display: 'flex', fontSize: 22, color: PIN, letterSpacing: 2 }}>oppidx.com</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  )
}
