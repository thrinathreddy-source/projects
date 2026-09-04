import Link from 'next/link'
import { Wordmark } from '@/components/ui/Wordmark'

// Do NOT add an `app/loading.tsx` (or any Suspense boundary above a page
// that calls notFound()). A root loading.tsx wraps every route in a
// Suspense boundary, so the first `await` in a dynamic page suspends, the
// fallback renders, and the response body starts streaming — which commits
// a 200 before the DB lookup has resolved. notFound() then renders this UI
// on a 200 instead of a 404 (a "soft 404"). That silently affected every
// dynamic route: /opportunities/[id], /resources/[id], /collections/[slug],
// /regions/[slug], /companies/[slug], /newsletter/[date], and
// /pulse/digest/[period]. With ~2,200 listing URLs in the sitemap and
// listings that come down when a source stops publishing them, Google
// treats each of those as a real page competing for crawl budget.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md
// ("Status Codes"): once streaming starts the status can no longer change.
// If a specific slow route needs a fallback, scope it to that segment —
// never the root — and only where a 404 status isn't required.

export const metadata = {
  title: 'Page not found — OppIDX',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card-box" style={{ padding: '36px 32px', maxWidth: 460, textAlign: 'center' }}>
        <div style={{ marginBottom: 14 }}><Wordmark size={20} /></div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)', textTransform: 'uppercase', marginBottom: 12 }}>
          Nothing pinned here.
        </h1>
        <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 20, lineHeight: 1.7 }}>
          That page doesn&apos;t exist, or the listing it pointed to has been taken down. Try the board instead.
        </p>
        <Link href="/browse" style={{
          display: 'inline-block', padding: '11px 22px', borderRadius: 2,
          background: 'var(--btn-bg)', color: 'var(--btn-text)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
        }}>
          Browse opportunities →
        </Link>
      </div>
    </div>
  )
}
