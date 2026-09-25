import OpenAI from 'openai'
import type { DigestItem } from '@/lib/policyDigest/generate'

/**
 * Writes the digest's one-paragraph intro as real prose instead of a
 * templated stat line ("N policy actions across M categories") — the
 * bare-list version nobody actually reads. The one rule that matters
 * here: this only ever describes what's genuinely in `items` (real
 * headlines already fetched from PIB/RBI/SEBI/Federal Register/SEC — see
 * lib/platform/pulseFeed.ts). It never invents a name, number, or event
 * beyond that list — same "never fake it" rule as every other AI/no-AI
 * call in this codebase, just applied to writing instead of moderation.
 *
 * The OpenAI client is constructed lazily inside the try block (not at
 * module scope) — same reasoning as lib/platform/moderation.ai.ts: a
 * missing OPENAI_API_KEY should fail this one call open, not crash the
 * digest cron.
 */
export async function writeNarrativeSummary(items: DigestItem[], periodLabel: string, fallback: string): Promise<string> {
  if (items.length === 0) return fallback

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const listing = items
      .slice(0, 40)
      .map(i => `- [${i.category}] ${i.title} — ${i.source}`)
      .join('\n')

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: [
            'You write the opening paragraph of a daily/weekly policy briefing for a general audience of students and young professionals.',
            'Write 3-5 sentences of plain, flowing prose — no bullet points, no headers, no lists.',
            'You may ONLY describe what is literally present in the headline list you are given below: real titles, categories, and sources. Never invent a name, number, policy, agency, or event that is not in the list.',
            'Group related items by theme where it reads naturally. Stay factual and calm — no opinion, no political framing, no speculation about intent or consequences beyond what the headlines themselves say.',
          ].join(' '),
        },
        { role: 'user', content: `Period: ${periodLabel}\n\nReal headlines from this period:\n${listing}` },
      ],
      max_tokens: 260,
      temperature: 0.4,
    })

    const text = res.choices[0]?.message?.content?.trim()
    return text || fallback
  } catch (e) {
    console.error('[policyDigest] AI summary failed, falling back to the templated line:', e instanceof Error ? e.message : e)
    return fallback
  }
}
