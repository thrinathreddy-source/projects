import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

/**
 * A page that calls notFound() can only produce a real 404 status if nothing
 * above it has started streaming the response body. A `loading.tsx` wraps its
 * segment (and everything below) in a Suspense boundary, so the page's first
 * `await` suspends, the fallback renders, the body starts streaming, and the
 * 200 is committed before the DB lookup resolves — notFound() then renders the
 * not-found UI on a 200. Google reads that as a real page: a soft 404.
 *
 * This guards the fix for exactly that: a root app/loading.tsx was silently
 * turning every dynamic route's 404 into a 200. See app/not-found.tsx.
 */

const APP_DIR = path.resolve(__dirname, '../../app')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = walk(APP_DIR)

/** Segment dir of a route file, relative to app/ ('' for the root segment). */
const segmentOf = (file: string) => path.relative(APP_DIR, path.dirname(file))

/** True when `ancestor` is the same segment as `seg`, or above it. */
function coversSegment(ancestor: string, seg: string): boolean {
  if (ancestor === '') return true
  return seg === ancestor || seg.startsWith(ancestor + path.sep)
}

describe('notFound() routes can still set a 404 status', () => {
  const loadingSegments = files
    .filter(f => /(^|\/)loading\.(tsx|ts|jsx|js)$/.test(f))
    .map(segmentOf)

  const notFoundPageSegments = files
    .filter(f => /(^|\/)page\.(tsx|ts|jsx|js)$/.test(f))
    .filter(f => /\bnotFound\(\)/.test(readFileSync(f, 'utf8')))
    .map(segmentOf)

  it('finds the pages that rely on a 404 status', () => {
    // Sanity check on the scan itself — if this ever hits zero the assertion
    // below would pass vacuously and stop guarding anything.
    expect(notFoundPageSegments.length).toBeGreaterThan(0)
  })

  it('has no loading.tsx above any page that calls notFound()', () => {
    const shadowed = notFoundPageSegments.flatMap(seg =>
      loadingSegments
        .filter(loadingSeg => coversSegment(loadingSeg, seg))
        .map(loadingSeg => `app/${path.join(loadingSeg, 'loading.tsx')} streams above app/${path.join(seg, 'page.tsx')}`)
    )

    expect(shadowed).toEqual([])
  })
})
