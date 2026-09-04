import { SITE_URL } from '@/lib/siteUrl'
import { opportunityPath } from '@/lib/slug'

interface ListingItem {
  id: string
  title: string
}

/**
 * Describes a server-rendered opportunity hub as a CollectionPage and its
 * visible cards as an ItemList. This deliberately receives only the items
 * rendered in HTML: structured data must reflect what a visitor can see,
 * never the larger subscriber-only result count.
 */
export function ListingPageSchema({
  title, description, path, items,
}: {
  title: string
  description: string
  /** Site-relative canonical path. */
  path: string
  items: ListingItem[]
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}${path}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${opportunityPath(item)}`,
        name: item.title,
      })),
    },
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
}
