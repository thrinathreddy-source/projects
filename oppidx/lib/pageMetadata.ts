import type { Metadata } from 'next'
import { SITE_URL } from './siteUrl'

/**
 * The site-wide share card (app/opengraph-image.tsx). Spelled out as a URL
 * rather than left to the file convention, because it does not survive the
 * override below — see the note on `image`. The hash-suffixed form Next emits
 * on the homepage is only a cache-buster; this path serves the same PNG.
 */
const DEFAULT_OG_IMAGE = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }

/**
 * Builds page metadata with openGraph/twitter explicitly mirroring
 * title/description — required because the root layout (app/layout.tsx)
 * defines its own static `openGraph`/`twitter` objects. Once an ancestor
 * layout sets those, Next.js stops auto-deriving them from a child route's
 * title/description; any generateMetadata() that returns only
 * `{ title, description }` silently inherits the root layout's og:title
 * ("OppIDX — the opportunity board") on every share instead of its own.
 * Every dynamic route (opportunity, collection, company, resource,
 * newsletter digest, ...) needs this to get a correct social preview.
 *
 * The share image needs the same treatment one level down, in both
 * directions. Metadata objects merge *shallowly* and duplicate keys are
 * replaced wholesale, so a page setting `openGraph` drops every openGraph
 * field an ancestor set — including the root opengraph-image.tsx that would
 * otherwise cascade. That shipped /browse, /resources, /pulse, /proof,
 * /advertise, /widget, /submit and /terms with a correct og:title and *no*
 * og:image, so every share of them rendered as a bare text link. The docs
 * prescribe this fix: pull the shared nested field out and spread it back in.
 * See "Overwriting fields" in
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md.
 *
 * But an explicit `images` also *beats* a route's own opengraph-image.tsx, so
 * defaulting it everywhere would replace each per-listing share card with the
 * generic one. Routes owning a file pass `image: 'route'` to stay out of the
 * way: /manifesto, /opportunities/[id], /resources/[id], /events/[slug] and
 * /pulse/digest/[period].
 */
export function pageMetadata({
  title, description, canonical, image,
}: {
  title: string
  description: string
  canonical?: string
  /**
   * `'route'` when this route has its own opengraph-image.tsx and should be
   * left to the file convention. Omit for the site-wide card.
   */
  image?: 'route' | { url: string; width: number; height: number }
}): Metadata {
  type OgImage = { url: string; width: number; height: number }
  const og: { title: string; description: string; images?: OgImage[] } = { title, description }
  if (image !== 'route') og.images = [image ?? DEFAULT_OG_IMAGE]

  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: og,
    twitter: og,
  }
}
