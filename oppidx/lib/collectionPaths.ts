/**
 * The canonical URL for a page of a collection.
 *
 * Page 1 keeps the bare `/collections/[slug]` URL rather than redirecting to
 * `/page/1`. That URL is already indexed, already in the sitemap at priority
 * 0.85, and already linked from the nav and footer — minting a second URL for
 * the same content would split its signals for no gain.
 *
 * Path segments rather than a `?page=` query string: reading searchParams
 * opts a route out of static rendering in Next, and these pages are prerendered
 * with hourly ISR. A path keeps them static and gives Google a cleaner URL to
 * treat as its own page.
 */
export function collectionPath(slug: string, page = 1): string {
  return page <= 1 ? `/collections/${slug}` : `/collections/${slug}/page/${page}`
}
