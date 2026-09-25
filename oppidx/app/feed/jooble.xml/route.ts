import { prisma } from '@/lib/db'

/**
 * GET /feed/jooble.xml — full-catalog feed built to Jooble's own XML Feed
 * Specification (https://jooble.org/files/xml_feed_specifications.pdf),
 * submitted once via their partner application; JoobleBot re-crawls this
 * URL on its own schedule after that — nothing here needs to be re-run.
 *
 * Only the tags Jooble marks as always-required are guaranteed to be
 * populated with real data: <link> <name> <region> <description> <pubdate>.
 * The conditionally-required ones (**) are included only where the
 * underlying data genuinely exists — <company> when opp.org is set,
 * <jobtype> only when "internship" is an actual tag on the listing. Jooble
 * also marks <salary> and <expire> as conditionally required, but this
 * board doesn't track a numeric salary or an application deadline for any
 * listing, scraped or submitted — inventing either would be exactly the
 * kind of fabricated data this whole scraper/site avoids elsewhere, so
 * both are omitted for every job rather than guessed.
 *
 * Jooble only indexes jobs published within the last 45 days of when it
 * first crawls this feed, so listings older than that are left out — no
 * point serving entries Jooble will just discard on its own.
 */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, ']]&gt;')}]]>`
}

function formatJoobleDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

export async function GET() {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)

  const items = await prisma.opportunity.findMany({
    where: { verified: true, deletedAt: null, addedAt: { gte: cutoff } },
    orderBy: { addedAt: 'desc' },
  })

  const jobItems = items.map(o => {
    const tags = o.tags.toLowerCase()
    const jobType = tags.includes('internship') || tags.includes('intern') ? 'internship' : null

    return `
  <job id="${o.id}">
    <link>${cdata(o.url)}</link>
    <name>${cdata(o.title)}</name>
    <region>${cdata(o.location || o.region || 'Remote')}</region>
    <description>${cdata(o.description)}</description>
    <pubdate>${formatJoobleDate(o.addedAt)}</pubdate>${o.org ? `
    <company>${cdata(o.org)}</company>` : ''}${jobType ? `
    <jobtype>${jobType}</jobtype>` : ''}
  </job>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<jobs>${jobItems}
</jobs>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
