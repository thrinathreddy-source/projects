/** The brand mark, everywhere it appears — "Opp" in ink, "IDX" in the logo's
 * terracotta, set in the display (typewriter) face rather than plain mono
 * so it reads as a considered wordmark, not just uppercase body text. */
export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span style={{ fontFamily: 'var(--font-display)', fontSize: size, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--ink)' }}>Opp</span>
      <span style={{ color: 'var(--terracotta)' }}>IDX</span>
    </span>
  )
}
