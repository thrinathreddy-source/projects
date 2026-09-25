import OpenAI from "openai";

/**
 * AI-backed content safety check, used by every route that accepts public
 * free text (e.g. advertise inquiries). The client
 * is constructed lazily, inside the try block below, rather than at module
 * scope — `new OpenAI()` throws immediately if OPENAI_API_KEY is missing,
 * which at module scope would crash every route that imports this file at
 * load time instead of just failing this one check open like the catch
 * block below already intends.
 */
export async function checkContentSafety(texts: string[]): Promise<{ flagged: boolean; reason?: string }> {
  const combined = texts.filter(Boolean).join("\n").trim();
  if (!combined) return { flagged: false };

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
