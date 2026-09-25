/**
 * One-off backfill: real og:image/og:video for existing opportunities that
 * predate lib/ogImage.ts (every new listing gets this at ingestion time
 * now — see lib/scraper/run.ts). Bounded and prioritized by viewCount, not
 * a blind pass over the whole table — running this against ~1,600
 * arbitrary external domains sequentially would take a long time and
 * hammer sites that don't need to hear from us again. A small worker pool,
 * a hard cap, and the existing 5s-per-request timeout in fetchOgMedia keep
 * this a reasonable, bounded job you can re-run to cover more of the
 * backlog.
 *
 * Targets anything still missing EITHER field — re-running this after an
 * image-only pass will also pick up video for rows that already got an
 * image, without re-fetching rows that already have both.
 *
 * Usage: npx ts-node scripts/backfill-images.ts [limit]
 * Defaults to the top 80 most-viewed opportunities missing image or video.
 */
import { prisma } from '../lib/db'
import { fetchOgMedia } from '../lib/ogImage'

const CONCURRENCY = 8

async function main() {
  const limit = parseInt(process.argv[2] ?? '80', 10) || 80

  const targets = await prisma.opportunity.findMany({
    where: { OR: [{ imageUrl: null }, { videoUrl: null }], verified: true, deletedAt: null },
    orderBy: { viewCount: 'desc' },
    take: limit,
    select: { id: true, url: true, title: true, imageUrl: true, videoUrl: true },
  })

  console.log(`Backfilling media for ${targets.length} opportunities (top ${limit} by views)…`)

  let foundImage = 0
  let foundVideo = 0
  let checked = 0
  let cursor = 0

  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor++]
      const { imageUrl, videoUrl } = await fetchOgMedia(target.url)
      checked++

      const data: Record<string, string> = {}
      if (imageUrl && !target.imageUrl) { data.imageUrl = imageUrl; foundImage++ }
      if (videoUrl && !target.videoUrl) { data.videoUrl = videoUrl; foundVideo++ }

      if (Object.keys(data).length > 0) {
        await prisma.opportunity.update({ where: { id: target.id }, data })
        console.log(`✓ [${checked}/${targets.length}] ${target.title}${data.videoUrl ? ' (+video)' : ''}`)
      } else {
        console.log(`· [${checked}/${targets.length}] ${target.title} — nothing found`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\nDone. ${foundImage} got an image, ${foundVideo} got a video, out of ${targets.length}.`)
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
