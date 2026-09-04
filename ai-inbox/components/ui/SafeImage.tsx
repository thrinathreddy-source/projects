'use client'

import { useState } from 'react'
import Image from 'next/image'

/** A real, sourced image (og:image, fetched at ingestion time — see
 * lib/ogImage.ts) that renders `fallback` if the stored URL ever fails to
 * load, instead of showing a broken-image icon. Shared by the opportunity
 * card and its detail page so there's one fallback behavior, not two. A
 * dead link is common enough on real external URLs (site redesigns, expired
 * CDN paths) that leaving `fallback` unset would otherwise mean a real,
 * once-valid image silently degrades to blanker than a card that never had
 * one at all — which is exactly backwards.
 *
 * Renders via next/image in `fill` mode — the caller is responsible for a
 * positioned (`position: relative`), explicitly sized ancestor, same as any
 * `fill` image. `sizes` should reflect how wide the image actually renders
 * at each breakpoint; it defaults to a card-thumbnail-sized guess.
 *
 * `priority` disables lazy-loading — pass it for the one image that's
 * already visible on first paint (a detail page's hero, say). Left off,
 * every image lazy-loads, which is correct for a grid of cards but means
 * an above-the-fold image sits blank until its own fetch finishes; that's
 * normal lazy-load behavior, not a broken image, but it reads as one. */
export function SafeImage({
  src, alt, style, fallback = null, sizes = '(max-width: 640px) 100vw, 640px', priority = false,
}: { src: string; alt: string; style?: React.CSSProperties; fallback?: React.ReactNode; sizes?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    <Image
      src={`/api/images?url=${encodeURIComponent(src)}`}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      style={{ objectFit: 'cover', ...style }}
      onError={() => setFailed(true)}
    />
  )
}
