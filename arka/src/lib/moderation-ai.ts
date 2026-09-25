import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * A second reader for the text of a request: OpenAI's moderation model.
 *
 * The idea comes from The Mayatara and OppIDX, which both screen free text
 * this way. Arka needs it for a reason neither of them had: **it takes
 * requests in twelve languages and reads the narration aloud.** The rules in
 * `moderation.ts` are word lists in English and romanised Hindi — a Tamil or
 * Devanagari script passes straight through them, and unlike the picture, the
 * narration has no safety negatives and no output classifier behind it. A
 * narration script is synthesised and muxed exactly as written. This is the
 * only layer that can read it.
 *
 * Deliberately narrow in what it refuses, for the same reason the word lists
 * are. The canon is Kurukshetra, Mahishasura's slaying and Lanka burning; a
 * general-purpose classifier calls all of that violence. So plain `violence`
 * is ignored outright, threats and graphic violence only ask for a human's
 * eye afterwards, and refusal is reserved for the categories no reading of
 * any epic needs.
 *
 * Optional. Without `OPENAI_API_KEY` it does nothing and the product behaves
 * exactly as before. With it, a failure or a timeout **fails open** and is
 * logged: the word lists, the safety negatives, the image classifier and the
 * review queue are all still underneath, and a moderation outage that stops
 * every render would be a worse failure than the one this layer exists to
 * catch.
 *
 * Plain `fetch` rather than the SDK, like the mailer — it is one endpoint.
 */

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
const TIMEOUT_MS = 5_000;
/** Title + prompt + script tops out near 3,200 characters; this is headroom. */
const MAX_INPUT_CHARS = 8_000;

/** Refused at submission. None of these is ever the product working. */
const BLOCK: Record<string, string> = {
  "sexual/minors": "This request is refused, and refusing it is not negotiable.",
  sexual:
    "Arka does not generate sexual content. It is built for stories, myth and folklore.",
  "hate/threatening": "Arka does not generate content that threatens a group of people.",
};

/**
 * Rendered, then shown to a person. Each of these is how a bad request would
 * be phrased and also how a faithful retelling of an epic sometimes reads.
 */
const REVIEW = [
  "hate",
  "harassment/threatening",
  "violence/graphic",
  "self-harm/intent",
  "self-harm/instructions",
  "illicit/violent",
];

export type AiScreen =
  | { outcome: "allow" }
  | { outcome: "block"; category: string; message: string }
  | { outcome: "review"; category: string }
  /** Not configured, or the call failed. The request proceeds. */
  | { outcome: "skipped"; reason: "not-configured" | "error" };

type ModerationResponse = {
  results?: { flagged?: boolean; categories?: Record<string, boolean> }[];
};

/** Turn the model's category flags into a decision. Pure; tested directly. */
export function decide(categories: Record<string, boolean>): AiScreen {
  for (const [category, message] of Object.entries(BLOCK)) {
    if (categories[category]) return { outcome: "block", category, message };
  }
  for (const category of REVIEW) {
    if (categories[category]) return { outcome: "review", category };
  }
  return { outcome: "allow" };
}

export function aiModerationConfigured(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

export async function screenText(text: string): Promise<AiScreen> {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) return { outcome: "skipped", reason: "not-configured" };

  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return { outcome: "allow" };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn("api", "Moderation model refused the request; failing open", {
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
      return { outcome: "skipped", reason: "error" };
    }

    const payload = (await response.json()) as ModerationResponse;
    const result = payload.results?.[0];

    if (!result?.categories) {
      logger.warn("api", "Moderation model returned no result; failing open");
      return { outcome: "skipped", reason: "error" };
    }

    return decide(result.categories);
  } catch (error) {
    logger.warn("api", "Could not reach the moderation model; failing open", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { outcome: "skipped", reason: "error" };
  }
}
