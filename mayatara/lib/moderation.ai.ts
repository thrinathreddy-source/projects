import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * AI-backed version of the content safety check, parked here (not wired into
 * any route) until we can afford the token cost. Swap lib/moderation.ts's
 * import for this file in app/api/auth/register/route.ts and
 * app/api/profile/save/route.ts to re-enable — same function signature.
 */
export async function checkContentSafety(texts: string[]): Promise<{ flagged: boolean; reason?: string }> {
  const combined = texts.filter(Boolean).join("\n").trim();
  if (!combined) return { flagged: false };

  try {
    const res = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: combined.slice(0, 4000),
    });

    const result = res.results[0];
    if (!result?.flagged) return { flagged: false };

    // Only hard-block on violence and sexual categories — leave milder
    // categories (e.g. harassment) for human review via reports instead.
    const cats = result.categories as unknown as Record<string, boolean>;
    const blockCategories = ["violence", "violence/graphic", "sexual", "sexual/minors"];
    const hit = blockCategories.find((c) => cats[c]);
    if (!hit) return { flagged: false };

    return { flagged: true, reason: hit };
  } catch (e) {
    console.error("[moderation] check failed, failing open:", e instanceof Error ? e.message : e);
    return { flagged: false };
  }
}
