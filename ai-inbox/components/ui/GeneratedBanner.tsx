/**
 * The fallback visual for a card/detail page with no real og:image — most
 * of the board, until the backfill catches up (lib/ogImage.ts, scripts/
 * backfill-images.ts). Deliberately NOT a stock photo or an AI image: this
 * codebase's whole stance is "never fake it," extended here to mean this
 * never pretends to depict the opportunity itself. It's flat, deterministic
 * generated art — same "stamped card" language as the rest of the site
 * (card-box's hard shadow, the ◆ dividers, dashed borders), built only from
 * the site's own palette. A real photo always wins the moment one exists;
 * this only ever fills the gap.
 */

const PALETTE = [
  { bg: '#1f3a5c', ink: '#f3e9cf' }, // navy — var(--pin)
  { bg: '#a8552e', ink: '#f3e9cf' }, // terracotta — var(--terracotta)
  { bg: '#4a7c59', ink: '#f3e9cf' }, // green — var(--green)
  { bg: '#8c4a3a', ink: '#f3e9cf' }, // brick
  { bg: '#2f6b6a', ink: '#f3e9cf' }, // dusty teal
  { bg: '#8a6a2e', ink: '#f3e9cf' }, // ochre
  { bg: '#5c3f5c', ink: '#f3e9cf' }, // plum
] as const

const AUDIENCE_GLYPH: Record<string, string> = {
  STUDENT: '🎓',
  EARLY_CAREER: '💼',
  FOUNDER: '🚀',
  GENERAL: '✦',
}

/** Deterministic djb2-ish hash — same opportunity always gets the same
 * banner, no flicker on re-render or between a feed card and its detail
 * page. */
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function StripesPattern({ id, ink }: { id: string; ink: string }) {
  return (
    <pattern id={id} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="22" height="22" fill="none" />
      <line x1="0" y1="0" x2="0" y2="22" stroke={ink} strokeWidth="7" strokeOpacity="0.14" />
    </pattern>
  )
}

function DotsPattern({ id, ink }: { id: string; ink: string }) {
  return (
    <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2.4" fill={ink} fillOpacity="0.16" />
    </pattern>
  )
}

function RingsPattern({ id, ink }: { id: string; ink: string }) {
  return (
    <pattern id={id} width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="30" cy="30" r="24" fill="none" stroke={ink} strokeWidth="1.5" strokeOpacity="0.14" />
      <circle cx="30" cy="30" r="15" fill="none" stroke={ink} strokeWidth="1.5" strokeOpacity="0.14" />
    </pattern>
  )
}

function CrosshatchPattern({ id, ink }: { id: string; ink: string }) {
  return (
    <pattern id={id} width="26" height="26" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="26" y2="26" stroke={ink} strokeWidth="1.2" strokeOpacity="0.14" />
      <line x1="26" y1="0" x2="0" y2="26" stroke={ink} strokeWidth="1.2" strokeOpacity="0.14" />
    </pattern>
  )
}

const PATTERNS = [StripesPattern, DotsPattern, RingsPattern, CrosshatchPattern]

export function GeneratedBanner({
  id,
  audience,
  height = 132,
}: {
  id: string
  audience: string
  height?: number
}) {
  const h = hash(id)
  const { bg, ink } = PALETTE[h % PALETTE.length]
  const Pattern = PATTERNS[Math.floor(h / PALETTE.length) % PATTERNS.length]
  const glyph = AUDIENCE_GLYPH[audience] ?? AUDIENCE_GLYPH.GENERAL
  const patternId = `banner-pattern-${id}`
  const glyphRotate = (h % 17) - 8 // -8..8deg, a little imperfection so a whole feed doesn't look stamped from a machine

  return (
    <div style={{ width: '100%', height, overflow: 'hidden', position: 'relative', background: bg, borderBottom: '1px solid var(--line)' }}>
      <svg width="100%" height="100%" viewBox="0 0 600 280" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <defs>
          <Pattern id={patternId} ink={ink} />
        </defs>
        <rect width="600" height="280" fill={bg} />
        <rect width="600" height="280" fill={`url(#${patternId})`} />
        <text
          x="86%"
          y="60%"
          fontSize="150"
          textAnchor="middle"
          dominantBaseline="middle"
          opacity="0.22"
          transform={`rotate(${glyphRotate} 516 168)`}
        >
          {glyph}
        </text>
      </svg>
      {/* Torn-ticket edge — same dashed language as RelatedPrompt's border,
          pulled into the visual layer instead of just the text layer. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 8,
        borderBottom: `2px dashed ${ink}`, opacity: 0.35,
      }} />
    </div>
  )
}
