import type { DigestItem } from '@/lib/policyDigest/generate'

/**
 * Writes the digest's opening paragraph as real prose, without an LLM call.
 * Pure templating over the same `items` list the digest already fetched —
 * every name, count, and title below is read directly off a real item, so
 * there is nothing to invent and nothing that can drift from the truth.
 * No external API calls, no tokens, no cost. AI-backed version (same
 * "never fake it" rule, written by GPT instead of templated) parked in
 * lib/policyDigest/summarize.ai.ts — swap the import in generate.ts back
 * to that file when there's budget for it again.
 */
export async function writeNarrativeSummary(items: DigestItem[], periodLabel: string, fallback: string): Promise<string> {
  if (items.length === 0) return fallback

  const byCategory = new Map<string, DigestItem[]>()
  for (const item of items) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }
  const ranked = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)

  const sentences: string[] = []

  const categoryCount = ranked.length
  sentences.push(
    `${items.length} policy action${items.length === 1 ? '' : 's'} landed ${periodLabel} across ${categoryCount} area${categoryCount === 1 ? '' : 's'}.`
  )

  const [topCategory, topItems] = ranked[0]
  sentences.push(
    `${topCategory} saw the most movement — ${topItems.length} update${topItems.length === 1 ? '' : 's'}, including "${topItems[0].title}" from ${topItems[0].source}.`
  )

  const rest = ranked.slice(1, 3)
  if (rest.length > 0) {
    const clauses = rest.map(([cat, list]) => `${cat} ("${list[0].title}")`)
    sentences.push(`${clauses.join(' and ')} also moved.`)
  }

  const sources = [...new Set(items.map(i => i.source))]
  const sourceList = sources.length > 3 ? `${sources.slice(0, 3).join(', ')}, and ${sources.length - 3} more` : sources.join(', ')
  sentences.push(`Sourced directly from ${sourceList} — no news outlets, no opinion.`)

  return sentences.join(' ')
}
