import { fetchSafeExternalImage } from '@/lib/ogImage'

// This route is intentionally Node-only: the shared SSRF guard resolves DNS
// before every request, which is not available in the Edge runtime.
export const runtime = 'nodejs'

/**
 * Same-origin image gateway for opportunity og:image URLs. next/image sees a
 * local source and can optimize/cache it, while this handler validates every
 * remote host and redirect before fetching. Never expose arbitrary remote URLs
 * directly through `images.remotePatterns`.
 */
export async function GET(request: Request) {
  const sourceUrl = new URL(request.url).searchParams.get('url')
  if (!sourceUrl) return new Response('Missing image URL.', { status: 400 })

  const upstream = await fetchSafeExternalImage(sourceUrl)
  if (!upstream?.body) return new Response('Image unavailable.', { status: 404 })

  const contentType = upstream.headers.get('content-type')?.split(';', 1)[0] ?? 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  return new Response(upstream.body, {
    headers: {
      'Content-Type': contentType,
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      // Source images are immutable in practice; cache at the CDN without
      // making a broken origin permanently sticky for visitors.
      'Cache-Control': 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
