import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// text-embedding-3-small: $0.02 per 1M tokens — ~$0.000004 per profile. Essentially free.
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // hard cap, profiles are well under this
  });
  return res.data[0].embedding;
}

export function profileToText(profile: Record<string, string>, lookingFor: string): string {
  return [
    `looking for: ${lookingFor}`,
    ...Object.entries(profile).map(([k, v]) => `${k}: ${v}`),
  ].join(". ");
}
