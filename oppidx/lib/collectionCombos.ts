import { COLLECTION_DEFS, type CollectionDef, type MatchInput } from '@/lib/collectionDefs'
import { matchPool } from '@/lib/opportunityPool'

/**
 * Generates two-dimensional collection pages (topic × location, topic ×
 * audience, topic × compensation, audience × location) on top of the single-
 * dimension ones in collectionDefs.ts — "AI & Machine Learning in India",
 * "Paid Software Engineering Opportunities", etc.
 *
 * This is deliberately NOT a blind cartesian product. Google treats a site
 * that mass-generates thin, near-duplicate combination pages as a "doorway
 * page" pattern and can suppress or penalize the whole domain for it — the
 * opposite of what this is trying to do. So every candidate combo is
 * checked against the real, live dataset first, and only kept if it clears
 * COMBO_MIN_LISTINGS. Most candidates get dropped; what's left is real.
 */
const COMBO_MIN_LISTINGS = 12

function comboLabel(def: CollectionDef): string {
  if (def.group === 'Topic' || def.group === 'Compensation') return def.title.replace(/ opportunities$/i, '')
  if (def.group === 'Audience') return def.title.replace(/^For /i, '')
  if (def.group === 'Location') return def.title.replace(/^Opportunities in /i, '')
  return def.title
}

// The source titles are sentence case ("Software engineering opportunities")
// since the H1 they normally feed is uppercased by CSS regardless — that
// casing leaks through undesirably once stitched into a combo title/<title>
// tag, which isn't uppercased. Capitalizes every word that starts lowercase;
// leaves existing capitals (AI, SRE) and connectors (&) alone.
function titleCase(s: string): string {
  return s.split(' ').map(w => (/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

function buildCombo(
  slug: string, title: string, description: string, a: CollectionDef, b: CollectionDef,
): CollectionDef {
  return {
    slug, title, pageTitle: `${title} — OppIDX`, description,
    group: 'Combo',
    match: (opp: MatchInput) => a.match(opp) && b.match(opp),
  }
}

/**
 * Memoised on top of the already-cached match pool.
 *
 * Both `getAllCollectionDefs` and `resolveCollectionDef` call this, and each
 * collection page calls the latter twice (once in generateMetadata, once in
 * the body), so across a build it ran hundreds of times — each time pulling
 * every column of every row and then running ~200 candidate predicates over
 * all of them. The pool read is now cached in lib/opportunityPool.ts and the
 * candidate evaluation is cached here, since it's a pure function of that
 * pool. See lib/opportunityPool.ts for why this mattered: it was failing the
 * production build outright.
 */
let combosCache: { at: number; defs: CollectionDef[] } | null = null
let combosInflight: Promise<CollectionDef[]> | null = null
const COMBOS_TTL_MS = 60_000

export async function getGeneratedCombos(): Promise<CollectionDef[]> {
  if (combosCache && Date.now() - combosCache.at < COMBOS_TTL_MS) return combosCache.defs
  if (combosInflight) return combosInflight
  combosInflight = computeGeneratedCombos()
    .then(defs => { combosCache = { at: Date.now(), defs }; return defs })
    .finally(() => { combosInflight = null })
  return combosInflight
}

async function computeGeneratedCombos(): Promise<CollectionDef[]> {
  const rows = await matchPool()

  const topics = COLLECTION_DEFS.filter(d => d.group === 'Topic')
  const audiences = COLLECTION_DEFS.filter(d => d.group === 'Audience')
  const remote = COLLECTION_DEFS.find(d => d.slug === 'remote')!
  const countries = COLLECTION_DEFS.filter(d => d.group === 'Location' && d.slug !== 'remote')
  const compTypes = COLLECTION_DEFS.filter(d => d.group === 'Compensation')

  const candidates: CollectionDef[] = []

  // Topic × Country — "AI & Machine Learning in India"
  for (const topic of topics) {
    const label = comboLabel(topic)
    const labelTitle = titleCase(label)
    for (const country of countries) {
      const place = comboLabel(country)
      candidates.push(buildCombo(
        `${topic.slug}-in-${country.slug}`,
        `${labelTitle} Opportunities in ${place}`,
        `Real ${label.toLowerCase()} opportunities based in ${place} — verified, not scraped junk.`,
        topic, country,
      ))
    }
    // Topic × Remote — "Remote AI & Machine Learning"
    candidates.push(buildCombo(
      `remote-${topic.slug}`,
      `Remote ${labelTitle} Opportunities`,
      `Real remote ${label.toLowerCase()} opportunities — verified, not scraped junk.`,
      topic, remote,
    ))
    // Topic × Audience — "AI & Machine Learning for Students"
    for (const audience of audiences) {
      const who = comboLabel(audience)
      candidates.push(buildCombo(
        `${topic.slug}-for-${audience.slug}`,
        `${labelTitle} Opportunities for ${who[0].toUpperCase()}${who.slice(1)}`,
        `Real ${label.toLowerCase()} opportunities for ${who} — verified, not scraped junk.`,
        topic, audience,
      ))
    }
    // Topic × Compensation — "Paid AI & Machine Learning Opportunities"
    for (const comp of compTypes) {
      const compLabel = comboLabel(comp)
      candidates.push(buildCombo(
        `${comp.slug}-${topic.slug}`,
        `${titleCase(compLabel)} ${labelTitle} Opportunities`,
        `Real ${compLabel.toLowerCase()} ${label.toLowerCase()} opportunities — verified, not scraped junk.`,
        topic, comp,
      ))
    }
  }

  // Audience × Country — "Opportunities for Students in India"
  for (const audience of audiences) {
    const who = comboLabel(audience)
    const whoCap = `${who[0].toUpperCase()}${who.slice(1)}`
    for (const country of countries) {
      const place = comboLabel(country)
      candidates.push(buildCombo(
        `${audience.slug}-in-${country.slug}`,
        `Opportunities for ${whoCap} in ${place}`,
        `Real opportunities for ${who} based in ${place} — verified, not scraped junk.`,
        audience, country,
      ))
    }
    // Audience × Remote — "Remote Opportunities for Students"
    candidates.push(buildCombo(
      `remote-for-${audience.slug}`,
      `Remote Opportunities for ${whoCap}`,
      `Real remote opportunities for ${who} — verified, not scraped junk.`,
      audience, remote,
    ))
  }

  return candidates.filter(c => rows.filter(r => c.match(r)).length >= COMBO_MIN_LISTINGS)
}
