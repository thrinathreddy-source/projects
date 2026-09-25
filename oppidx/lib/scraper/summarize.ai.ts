import OpenAI from 'openai'

/**
 * Writes a short, original 1-2 sentence summary of a real opportunity —
 * the one piece of genuinely unique copy on an opportunity page, since
 * `description` is usually scraped verbatim from the original posting and
 * identical to what Indeed/LinkedIn/the employer's own careers page show.
 * Same "never fake it" rule as lib/policyDigest/summarize.ai.ts: this may
 * ONLY describe what's literally in title/org/rawDescription — never invent
 * a deadline, stipend amount, requirement, or detail the source didn't
 * actually state. Returns null (not a fabricated fallback string) if the
 * call fails or the key is missing — callers treat null as "not yet
 * summarized" and just show the raw description, same as before this
 * feature existed.
 */
export async function writeOpportunitySummary(title: string, org: string | null, rawDescription: string): Promise<string | null> {
  if (!rawDescription.trim()) return null

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: [
            'You write a single short, original summary sentence (max 2 sentences) of a real internship/job/scholarship/fellowship listing for a student/early-career audience.',
            'You may ONLY state facts literally present in the title, organization, and description given below — never invent a deadline, stipend, salary figure, location, or requirement that is not explicitly there.',
            'Do not copy phrases verbatim from the description — rephrase in your own words so this reads as genuinely original writing, not a paraphrase-by-synonym.',
            'Plain, direct, no marketing hype ("amazing", "exciting"), no emoji, no headers, just the sentence(s).',
          ].join(' '),
        },
        { role: 'user', content: `Title: ${title}\nOrganization: ${org || 'not stated'}\nDescription: ${rawDescription.slice(0, 1500)}` },
      ],
      max_tokens: 100,
      temperature: 0.3,
    })

    const text = res.choices[0]?.message?.content?.trim()
    return text || null
  } catch (e) {
    console.error('[scraper] AI summary failed, leaving summary null:', e instanceof Error ? e.message : e)
    return null
  }
}
