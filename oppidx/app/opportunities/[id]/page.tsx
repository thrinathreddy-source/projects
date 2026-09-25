import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { isCuid, opportunityPath } from '@/lib/slug'
import { ViewTracker } from '@/components/ui/ViewTracker'
import { ShareBar } from '@/components/ui/ShareBar'
import { SaveButton } from '@/components/ui/SaveButton'
import { OpportunityCard } from '@/components/ui/OpportunityCard'
import { SITE_URL } from '@/lib/siteUrl'
import { pageMetadata } from '@/lib/pageMetadata'
import { relatedResourceCategories } from '@/lib/opportunityResourceMap'
import { fetchUpcomingGatheringsPool, matchGatheringsFromPool } from '@/lib/opportunityGatheringMap'
import { chasingCohortSize } from '@/lib/chasingCohort'
import { fetchRecentPolicyItemsPool, matchPolicyReadsFromPool } from '@/lib/opportunityPulseMap'
import { Discussion } from '@/components/ui/Discussion'
import { SafeImage } from '@/components/ui/SafeImage'
import { VideoEmbed } from '@/components/ui/VideoEmbed'
import { GeneratedBanner } from '@/components/ui/GeneratedBanner'
import { EcosystemActions } from '@/components/ui/EcosystemActions'
import { isEligibleJobPosting } from '@/lib/seo/jobPosting'
import { outboundRel, REFERENCE_REL } from '@/lib/seo/outboundRel'
import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui/Breadcrumbs'
import { FEED_URL as JOBICY_SOURCE_URL } from '@/lib/scraper/sources/jobicy'
import { SOURCE_URL as ADZUNA_SOURCE_URL } from '@/lib/scraper/sources/adzuna'
import type { Opportunity } from '@/types'

const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  EARLY_CAREER: 'Early Career',
  FOUNDER: 'Founder',
  GENERAL: 'General',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: 'var(--green)',
  Medium: 'var(--pin)',
  Hard: 'var(--danger)',
}

/**
 * Resolves the single `[id]` segment as either a slug or a legacy cuid.
 *
 * Both have to keep working indefinitely: cuid URLs are already in Google's
 * index, already in the RSS feed, and already pasted in whatever group chats
 * carried this board before slugs existed. A cuid request that resolves to a
 * row with a slug gets a 308 to the slug form (see the page component), so
 * link equity consolidates on one canonical URL without ever 404ing the old
 * one.
 */
/**
 * The most search-visible template on the site, and until now the only one
 * with no caching at all: no generateStaticParams and no revalidate meant
 * every request rendered dynamically, so Next marked the response
 * `private, no-cache, no-store` and every Googlebot fetch of every one of
 * ~2,400 listings ran the lookup plus the five parallel queries below against
 * Turso. Google's crawl-budget guidance is explicit that host response time is
 * what expands or contracts a site's crawl rate, and this was the most
 * expensive possible way to spend it.
 *
 * `generateStaticParams` below is required for any of that to happen —
 * `revalidate` on its own is silently inert here. See its comment.
 *
 * What this does NOT fix, measured rather than assumed: permanentRedirect()
 * still does not produce a 308 from this route. Under ISR the redirect goes
 * into the RSC payload, so it moves a client-side navigation but a plain
 * crawler GET gets a 200 with the page's content. Both redirect call sites
 * below therefore still lean on the canonical tag to tell crawlers which URL
 * counts, exactly as they did when the route was fully dynamic.
 */
export const revalidate = 3600

/**
 * Deliberately empty, and required — `revalidate` alone does nothing here.
 *
 * Verified against a production build: a dynamic segment with no
 * generateStaticParams gets no entry in .next/prerender-manifest.json at all,
 * so it stays fully dynamic and Next keeps emitting
 * `private, no-cache, no-store` no matter what `revalidate` says. Exporting
 * this — even returning nothing — is what registers the route as ISR with a
 * blocking fallback, so each listing is rendered once on first request and
 * then served from cache for the next hour.
 *
 * Empty rather than "the newest N listings" on purpose: prerendering
 * thousands of these at build time is what made builds fall over before (see
 * lib/opportunityPool.ts), and warming them at build buys nothing an
 * on-demand render plus an hour of caching doesn't already give.
 */
export function generateStaticParams(): { id: string }[] {
  return []
}

/**
 * Looks up a listing including soft-deleted rows, because two of the three
 * outcomes need the row: a live listing renders, a collapsed duplicate
 * redirects to its survivor, and anything else 404s.
 */
async function getOpportunity(idOrSlug: string) {
  const opp = isCuid(idOrSlug)
    ? await prisma.opportunity.findUnique({ where: { id: idOrSlug } })
    : await prisma.opportunity.findUnique({ where: { slug: idOrSlug } })
  if (!opp) return null
  // A duplicate collapsed by scripts/migrate-dedupe-turso.ts is soft-deleted
  // *and* carries duplicateOfId. It stays resolvable here so the page can 308
  // to the canonical listing; every other soft-deleted row is gone for good.
  if (opp.deletedAt && !opp.duplicateOfId) return null
  return opp
}

/** Where a collapsed duplicate should send its reader — the surviving row's
 * canonical path. Falls back to null if the survivor has itself since been
 * removed, in which case the duplicate 404s like any other deleted listing. */
async function duplicateTarget(duplicateOfId: string) {
  const survivor = await prisma.opportunity.findUnique({
    where: { id: duplicateOfId },
    select: { id: true, slug: true, deletedAt: true },
  })
  if (!survivor || survivor.deletedAt) return null
  return opportunityPath(survivor)
}

/** A few other live listings sharing this one's audience or region — keeps a
 * visitor browsing instead of leaving after a single listing. */
async function getSimilar(opp: { id: string; audience: string; region: string }) {
  const rows = await prisma.opportunity.findMany({
    where: {
      id: { not: opp.id },
      verified: true,
      deletedAt: null,
      OR: [{ audience: opp.audience }, ...(opp.region ? [{ region: opp.region }] : [])],
    },
    orderBy: { addedAt: 'desc' },
    take: 4,
  })
  // OpportunityCard expects the shared Opportunity type (addedAt as an ISO string,
  // matching the client-side /api/opportunities JSON shape, and audience/difficulty
  // narrowed to their known literal unions), not Prisma's raw String columns.
  return rows.map(r => ({ ...r, addedAt: r.addedAt.toISOString() })) as unknown as Opportunity[]
}

/** Real Resources related to this opportunity — the Opportunities →
 * Resources graph edge. Empty when nothing genuinely matches, rather
 * than forcing an unrelated category onto the page. */
async function getRelatedResources(opp: { audience: string; tags: string }) {
  const categories = relatedResourceCategories(opp)
  if (categories.length === 0) return []
  return prisma.resource.findMany({
    where: { category: { in: categories }, verified: true, deletedAt: null },
    orderBy: { addedAt: 'desc' },
    take: 3,
  })
}

/** Real, upcoming, published gatherings related to this
 * opportunity — the Opportunities → Gatherings graph edge
 * (lib/opportunityGatheringMap.ts). Empty when nothing's genuinely
 * scheduled, same rule as everywhere else. */
async function getRelatedGatherings(opp: { audience: string; tags: string }) {
  const pool = await fetchUpcomingGatheringsPool()
  return matchGatheringsFromPool(opp, pool)
}

/** Real Pulse policy headlines related to this opportunity — the
 * Opportunities → Policy graph edge (lib/opportunityPulseMap.ts). Empty
 * when nothing genuinely matches. */
async function getRelatedPolicyReads(opp: { audience: string; tags: string; country: string }) {
  const pool = await fetchRecentPolicyItemsPool()
  return matchPolicyReadsFromPool(opp, pool)
}

// A scannable facts line ahead of the summary — compType/location/audience
// are real, per-listing, already-verified fields (see prisma/schema.prisma),
// never invented for the snippet. Each clause only appears when that field
// is actually set; a listing with none of them just falls back to the
// summary alone, same as before this existed. Deliberately does NOT include
// anything resembling a deadline — the schema has no such field, and a
// meta description claiming an application date the page itself doesn't
// show is exactly the kind of snippet/content mismatch Google penalizes.
/**
 * The visible deadline line, or null when the listing has no stated deadline
 * or it has already passed.
 *
 * A passed deadline renders nothing rather than "closed on ...": the value was
 * read out of scraped prose, so it is good enough to advertise an open window
 * but not good enough to tell someone a real opportunity is shut. Retiring
 * genuinely dead listings is the link-health cron's job, on evidence from the
 * employer's own site.
 */
function deadlineDisplay(validThrough: Date | null, now = Date.now()): { label: string; soon: boolean } | null {
  if (!validThrough) return null
  const ms = validThrough.getTime() - now
  if (ms <= 0) return null
  return {
    label: validThrough.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    soon: ms < 14 * 24 * 60 * 60_000,
  }
}

function metaFactsLine(opp: { compType: string | null; audience: string; location: string | null; region: string }): string {
  const facts = [opp.compType, AUDIENCE_LABEL[opp.audience], opp.location || opp.region || null]
    .filter((f): f is string => Boolean(f))
  return facts.join(' • ')
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const opp = await getOpportunity(id)
  if (!opp) return { title: 'Page not found — OppIDX' }

  // A collapsed duplicate points its canonical at the survivor rather than at
  // itself. The page body 308s as well, but the canonical is what consolidates
  // the two in the index if a crawler reads this URL before following the
  // redirect — same belt-and-braces pairing the cuid→slug case already uses.
  if (opp.duplicateOfId) {
    const target = await duplicateTarget(opp.duplicateOfId)
    if (target) {
      return pageMetadata({
        title: opp.org ? `${opp.title} at ${opp.org} — OppIDX` : `${opp.title} — OppIDX`,
        description: opp.summary || opp.description,
        canonical: `${SITE_URL}${target}`,
        image: 'route', // app/opportunities/[id]/opengraph-image.tsx
      })
    }
  }

  const facts = metaFactsLine(opp)
  // Prefer the original AI-written summary over a truncated raw
  // description — the raw text is usually scraped verbatim from the
  // original posting, so a meta description built from it tends to be
  // near-identical to what Indeed/LinkedIn/the employer's own listing
  // shows in the same search results. summary is genuinely unique copy.
  const body = opp.summary || opp.description

  return pageMetadata({
    title: opp.org ? `${opp.title} at ${opp.org} — OppIDX` : `${opp.title} — OppIDX`,
    description: (facts ? `${facts} — ${body}` : body).slice(0, 160),
    // Always the slug form when one exists, even when this request arrived
    // on the legacy cuid URL — that's what makes the two forms consolidate
    // rather than compete as duplicates.
    canonical: `${SITE_URL}${opportunityPath(opp)}`,
    image: 'route', // app/opportunities/[id]/opengraph-image.tsx
  })
}

// Real navigation path, not a fabricated one: Collections pages for
// STUDENT/EARLY_CAREER/FOUNDER already exist and are linked from the
// header nav (see lib/collectionDefs.ts); GENERAL has no dedicated
// collection, so it falls back to the real /browse listing instead.
const AUDIENCE_COLLECTION: Record<string, { slug: string; label: string }> = {
  STUDENT: { slug: 'students', label: 'Students' },
  EARLY_CAREER: { slug: 'early-career', label: 'Early Career' },
  FOUNDER: { slug: 'founders', label: 'Founders' },
}

function breadcrumbTrail(opp: { id: string; slug: string | null; title: string; audience: string }): BreadcrumbItem[] {
  const collection = AUDIENCE_COLLECTION[opp.audience]
  return [
    { name: 'OppIDX', href: '/' },
    collection ? { name: collection.label, href: `/collections/${collection.slug}` } : { name: 'Browse', href: '/browse' },
    { name: opp.title, href: opportunityPath(opp) },
  ]
}

// Google's JobPosting rich result is for actual employment listings —
// applying it to a scholarship, grant, or competition would be structured-
// data misuse (and risks a manual action against the whole site), so this
// only fires for listings whose tags don't carry one of those non-job
// signals. No fabricated fields, ever: addressRegion/employmentType/
// baseSalary are only emitted when Opportunity actually has a real,
// source-derived value stored (see lib/scraper/normalize.ts and
// lib/scraper/sources/adzuna.ts for how those get populated honestly) —
// still omitted otherwise, same as validThrough/streetAddress/postalCode
// always are, since nothing in this pipeline captures those at all.
//
// hiringOrganization and a location signal (jobLocation, or jobLocationType
// "TELECOMMUTE" + applicantLocationRequirements) are both REQUIRED by
// Google's spec, not just recommended — a JobPosting missing either is
// invalid and won't qualify for the Google Jobs experience at all. Every
// branch below returns null rather than emit a script tag with one of
// those missing, since a page with no JobPosting markup is strictly better
// than one with structured data Google rejects.
function jobPostingJsonLd(opp: NonNullable<Awaited<ReturnType<typeof getOpportunity>>>, pageUrl: string): string | null {
  const tags = opp.tags.toLowerCase()
  if (!isEligibleJobPosting(opp)) return null // required org + location signal; never guess either

  const isRemote = /\bremote\b/i.test(opp.location ?? '') || /\bremote\b/i.test(opp.region ?? '')

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: opp.title,
    description: opp.description,
    datePosted: opp.addedAt.toISOString(),
    hiringOrganization: { '@type': 'Organization', name: opp.org },
    employmentType: opp.employmentType || (tags.includes('internship') || tags.includes('intern') ? 'INTERN' : undefined),
    directApply: false,
    url: pageUrl,
  }

  // Only ever a deadline the listing itself states (lib/scraper/deadline.ts),
  // and only while it is still in the future — a validThrough in the past
  // tells Google the posting is over and removes it from Jobs, so emitting a
  // stale one would actively deindex a live listing. Absent on most listings,
  // which is fine: validThrough is recommended, not required, and is read per
  // page. The visible "Applications close" line below renders off the exact
  // same field, so the markup never claims something the page doesn't show.
  if (opp.validThrough && opp.validThrough.getTime() > Date.now()) {
    jsonLd.validThrough = opp.validThrough.toISOString()
  }

  if (opp.salaryMin != null && opp.salaryMax != null && opp.salaryCurrency) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: opp.salaryCurrency,
      value: { '@type': 'QuantitativeValue', minValue: opp.salaryMin, maxValue: opp.salaryMax, unitText: 'YEAR' },
    }
  }

  // applicantLocationRequirements is required whenever jobLocationType is
  // TELECOMMUTE — a remote listing whose country we don't know can't
  // honestly satisfy that, so it falls through to the physical-location
  // branch instead (using its own location text, e.g. "Remote", verbatim)
  // rather than emit a TELECOMMUTE job with no applicantLocationRequirements.
  if (isRemote && opp.country) {
    jsonLd.jobLocationType = 'TELECOMMUTE'
    jsonLd.applicantLocationRequirements = { '@type': 'Country', name: opp.country }
  } else if (opp.location || opp.country) {
    jsonLd.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: opp.location || undefined,
        addressRegion: opp.addressRegion || undefined,
        addressCountry: opp.country || undefined,
      },
    }
  } else {
    return null // no location signal at all — required property can't be satisfied
  }

  // Escaping "<" stops a "</script>" inside a scraped description from
  // closing the script tag early — standard JSON-LD embedding safeguard.
  return JSON.stringify(jsonLd).replace(/</g, '\\u003c')
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const opp = await getOpportunity(id)
  if (!opp) notFound()

  // A duplicate that was collapsed into another row — consolidate onto the
  // survivor rather than 404ing it. These URLs are not "gone": they are the
  // same listing already indexed under a second address, so pointing them at
  // the survivor merges the two in the index instead of discarding whatever
  // either had accumulated. As above, the consolidation is carried by the
  // canonical generateMetadata emits (verified: a direct GET of a collapsed
  // duplicate returns 200 with a canonical pointing at the survivor); this
  // call additionally moves anyone navigating client-side. If the survivor
  // has itself been removed since, fall through to the ordinary 404.
  if (opp.duplicateOfId) {
    const target = await duplicateTarget(opp.duplicateOfId)
    if (target) permanentRedirect(target)
    notFound()
  }

  // Legacy cuid URL for a listing that now has a slug — send the reader to
  // the readable one.
  //
  // Deliberately here in the page body rather than in generateMetadata.
  // permanentRedirect() throws to unwind, so calling it from generateMetadata
  // aborted that function before it returned — meaning the cuid URL emitted
  // the redirect and *no canonical tag at all*, which is the opposite of what
  // was wanted. From here, generateMetadata completes and emits a canonical
  // pointing at the slug, and this still fires before any of the related-
  // content queries below.
  //
  // Deliberately here in the page body rather than in generateMetadata.
  // permanentRedirect() throws to unwind, so calling it from generateMetadata
  // aborted that function before it returned — meaning the cuid URL emitted
  // the redirect and *no canonical tag at all*, which is the opposite of what
  // was wanted. From here, generateMetadata completes and emits a canonical
  // pointing at the slug, and this still fires before any of the related-
  // content queries below.
  //
  // Measured behaviour, not the documented ideal, and re-confirmed against a
  // production build after this route moved to ISR: this does not emit a 308.
  // The redirect ends up in the RSC payload, so it moves a client-side
  // navigation while a direct GET — which is what a crawler makes — returns
  // 200 with this page's content. The canonical above is therefore the signal
  // that actually consolidates the two URLs, and it is doing that correctly.
  // A config-level redirect isn't available either, since the destination
  // needs a database lookup.
  if (opp.slug && id !== opp.slug) permanentRedirect(opportunityPath(opp))

  const tags = opp.tags.split(',').map(t => t.trim()).filter(Boolean)

  // All five are independent reads — two of them (gatherings, policy reads)
  // pull a whole pool before matching. Awaited sequentially they stacked five
  // round-trips into the TTFB of the single most search-visible template on
  // the site. Same pattern already used in app/sitemap.ts.
  //
  // This matters more than it used to: there is deliberately no Suspense
  // boundary above this page (see app/not-found.tsx), so the whole render is
  // what the visitor waits on before any HTML is sent, rather than being
  // hidden behind a spinner. Awaited after the notFound() above, never before
  // it — anything that suspends ahead of notFound() commits a 200.
  const [similar, relatedResources, relatedGatherings, relatedPolicyReads, chasingCount] = await Promise.all([
    getSimilar(opp),
    getRelatedResources(opp),
    getRelatedGatherings(opp),
    getRelatedPolicyReads(opp),
    chasingCohortSize(opp.id),
  ])

  const pageUrl = `${SITE_URL}${opportunityPath(opp)}`
  const jobLd = jobPostingJsonLd(opp, pageUrl)
  const deadline = deadlineDisplay(opp.validThrough)

  return (
    <div style={{ padding: '28px var(--gutter) 60px' }}>
      {jobLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jobLd }} />}
      <ViewTracker id={opp.id} />
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Breadcrumbs items={breadcrumbTrail(opp)} />

        {opp.videoUrl ? (
          <VideoEmbed src={opp.videoUrl} />
        ) : opp.imageUrl ? (
          <div style={{
            position: 'relative', height: 220, marginTop: 20, borderRadius: 3,
            border: '1.5px solid var(--line)', boxShadow: '4px 4px 0 var(--shadow)', overflow: 'hidden',
          }}>
            <SafeImage
              src={opp.imageUrl}
              alt={opp.org ? `${opp.title} at ${opp.org}` : opp.title}
              sizes="(max-width: 640px) 100vw, 640px"
              priority
              fallback={<GeneratedBanner id={opp.id} audience={opp.audience} height={220} />}
            />
          </div>
        ) : (
          <div style={{
            marginTop: 20, borderRadius: 3, border: '1.5px solid var(--line)',
            boxShadow: '4px 4px 0 var(--shadow)', overflow: 'hidden',
          }}>
            <GeneratedBanner id={opp.id} audience={opp.audience} height={220} />
          </div>
        )}

        <div className="card-box card-pad-lg" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--pin)',
              }}>
                {AUDIENCE_LABEL[opp.audience] ?? opp.audience}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                color: DIFFICULTY_COLOR[opp.difficulty] ?? 'var(--ink-3)',
              }}>
                {opp.difficulty}
              </span>
            </div>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1.3, marginBottom: 8, color: 'var(--ink)' }}>
            {opp.title}
          </h1>
          {opp.org && <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 20 }}>{opp.org}</div>}

          {opp.summary && (
            <p style={{
              fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, marginBottom: 18, fontWeight: 600,
              paddingLeft: 14, borderLeft: '3px solid var(--terracotta)',
            }}>
              {opp.summary}
            </p>
          )}

          <p style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.75, marginBottom: 24, whiteSpace: 'pre-wrap' }}>
            {opp.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 26, fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {opp.location && <span>📍 {opp.location}</span>}
            {opp.compType && <span style={{ color: 'var(--green)', fontWeight: 600 }}>{opp.compType}</span>}
            {/* Rendered from the same field the JobPosting validThrough reads,
                because Google requires structured data to match what the page
                actually shows — markup-only deadlines are a policy violation.
                Shown for every listing that has one, whether or not that
                listing is JobPosting-eligible: a scholarship deadline is just
                as useful to a reader. */}
            {deadline && (
              <span style={{ color: deadline.soon ? 'var(--danger)' : 'var(--ink-2)', fontWeight: deadline.soon ? 700 : 400 }}>
                ⏳ Applications close {deadline.label}
              </span>
            )}
          </div>

          {opp.eligibility && (
            <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
              <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6 }}>
                Who can apply
              </h2>
              <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.65 }}>{opp.eligibility}</div>
            </div>
          )}

          {opp.prepResources && (
            <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
              <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 6 }}>
                How to prepare
              </h2>
              <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{opp.prepResources}</div>
            </div>
          )}

          <div id="related">
            <EcosystemActions
              opp={{ id: opp.id, title: opp.title, tags: opp.tags, audience: opp.audience }}
              variant="full"
              hasResources={relatedResources.length > 0}
              hasGatherings={relatedGatherings.length > 0}
            />

            {relatedResources.length > 0 && (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pin)', marginBottom: 8 }}>
                  📚 Resources that might help
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {relatedResources.map(r => (
                    <Link key={r.id} href={`/resources/${r.id}`} style={{ fontSize: 13.5, color: 'var(--pin)', textDecoration: 'none' }}>
                      {r.title} <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>· {r.category}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {relatedPolicyReads.length > 0 && (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terracotta)', marginBottom: 8 }}>
                  📰 Policy reads
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {relatedPolicyReads.map(p => (
                    <a key={p.url} href={p.url} target="_blank" rel={REFERENCE_REL} style={{ fontSize: 13.5, color: 'var(--pin)', textDecoration: 'none' }}>
                      {p.title} <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>· {p.source}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {relatedGatherings.length > 0 && (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
                <h2 style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
                  📍 Gatherings for people chasing this
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {relatedGatherings.map(g => (
                    <a key={g.slug} href={`/events/${g.slug}`} style={{ fontSize: 13.5, color: 'var(--pin)', textDecoration: 'none' }}>
                      {g.title} <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>· {g.location}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {chasingCount > 0 && (
              <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--board)', borderRadius: 2, border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--terracotta)', marginBottom: 6 }}>
                  🫂 {chasingCount} others also chasing this
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  No browsable list here — that would out who&apos;s applying to what. If you&apos;ve used{' '}
                  <em>Find your person</em> above, a real match within this group (if there&apos;s a good one) reveals itself the usual way, this Friday.
                </div>
              </div>
            )}

            <Discussion opportunityId={opp.id} />
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 30 }}>
              {tags.map(t => (
                <span key={t} style={{
                  fontSize: 11, color: 'var(--ink-2)', background: 'rgba(43,38,32,0.06)',
                  borderRadius: 980, padding: '3px 10px', fontFamily: 'var(--font-mono)',
                }}>#{t}</span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>
            <a href={opp.url} target="_blank" rel={outboundRel(opp.sourceUrl)} style={{ color: 'var(--pin)', fontWeight: 700, textDecoration: 'none' }}>
              Apply → {opp.url}
            </a>
            <SaveButton opportunityId={opp.id} />
          </div>

          {/* Jobicy's API terms require this listing to credit them with a direct
              link — keyed off the exact sourceUrl lib/scraper/sources/jobicy.ts stores. */}
          {opp.sourceUrl === JOBICY_SOURCE_URL && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
              Found via <a href="https://jobicy.com/remote-jobs" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-3)' }}>Jobicy</a>
            </div>
          )}

          {/* Same on-page credit convention as Jobicy above — keyed off the
              exact sourceUrl lib/scraper/sources/adzuna.ts stores. */}
          {opp.sourceUrl === ADZUNA_SOURCE_URL && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>
              Found via <a href="https://www.adzuna.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-3)' }}>Adzuna</a>
            </div>
          )}

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
              Know someone this is for?
            </div>
            <ShareBar title={opp.title} url={pageUrl} />
          </div>
        </div>

        {similar.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <div className="divider" style={{ marginBottom: 20 }}>
              <span>◆ Similar opportunities ◆</span>
            </div>
            <div className="card-grid" style={{ ['--card-min' as string]: '230px', gap: 20 }}>
              {similar.map(s => <OpportunityCard key={s.id} opp={s} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
