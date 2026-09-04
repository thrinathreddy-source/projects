/** A real og:video from the listing's own page (lib/ogImage.ts) — never a
 * stock clip. Direct media files play natively; anything else (YouTube,
 * Vimeo, and most og:video URLs, which are conventionally already
 * player-embed links) renders in an iframe. Server component — no
 * fallback state needed here, a broken src just shows the browser's own
 * native "can't play this" state inside the frame, not a page-breaking
 * error. */
export function VideoEmbed({ src }: { src: string }) {
  const isDirectFile = /\.(mp4|webm|ogg)(\?|$)/i.test(src)

  return (
    <div style={{
      marginTop: 20, borderRadius: 3, overflow: 'hidden',
      border: '1.5px solid var(--line)', boxShadow: '4px 4px 0 var(--shadow)',
      aspectRatio: '16 / 9', background: '#000',
    }}>
      {isDirectFile ? (
        <video controls style={{ width: '100%', height: '100%', display: 'block' }}>
          <source src={src} />
        </video>
      ) : (
        <iframe
          src={src}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      )}
    </div>
  )
}
