import Link from 'next/link'
import { SITE_URL } from '@/lib/siteUrl'

export interface BreadcrumbItem {
  name: string
  /** Site-relative path, e.g. '/collections/students'. */
  href: string
}

/** Visible breadcrumb trail plus its matching BreadcrumbList JSON-LD, built
 * from a single list of items so the two can never drift apart. The last
 * item renders as plain text (current page), not a link. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.href}`,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>
        {items.map((it, i) => (
          <span key={it.href}>
            {i > 0 && <span style={{ margin: '0 6px', opacity: 0.6 }}>/</span>}
            {i < items.length - 1
              ? <Link href={it.href} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>{it.name}</Link>
              : <span aria-current="page">{it.name}</span>}
          </span>
        ))}
      </nav>
    </>
  )
}
