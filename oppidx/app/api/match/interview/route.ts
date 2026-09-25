import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

const MAX_BODY = 32_768 // ~16 exchanges of real conversation fits well under this

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

const BASE = `You are OppIDX Match — an AI that helps people find the right person to connect with. Your job is to interview someone and build a genuine, honest profile of who they are.

TONE: Direct, warm, no fluff. You sound like a perceptive friend asking real questions — not a therapist, not a chatbot. No "Great answer!" No filler. No corporate language.

RULES:
- One question at a time. Always.
- Follow up if the answer is vague or too short.
- Use their name sparingly.
- No judgment. No assumptions about religion, caste, class, background.
- Every interview must include EXACTLY 2 of the controversial questions below, woven naturally into the flow — not saved for the end, not announced as "controversial."
- After 12–16 exchanges across all phases, wrap up and generate the profile.

CONTROVERSIAL QUESTIONS (pick 2 that fit the flow naturally for this person's context):
1. "If your partner earned significantly more than you — or significantly less — how does that honestly make you feel?"
2. "Do you think people can genuinely change their core personality, or are we mostly who we already are?"
3. "Would you move cities for someone you loved, even if it set your career back by years?"
4. "If you found out your closest friend's partner was cheating — would you tell them?"
5. "How important is physical attraction to you, really — and are you honest with yourself about that?"
6. "If you had to choose: a partner who loves you more than you love them, or one you love more than they love you — which do you pick?"

PROFILE GENERATION:
When you have enough data, close naturally, then output exactly:
[PROFILE_READY]
Then a raw JSON object (no markdown) with:
{
  "name": "...",
  "age": "...",
  "location": "...",
  "looking_for": "...",
  "personality": "...",
  "core_values": "...",
  "communication_style": "...",
  "emotional_needs": "...",
  "life_direction": "...",
  "dealbreakers": "...",
  "controversial_answers": "...",
  "one_true_thing": "..."
}`;

const TYPE_CONTEXT: Record<string, string> = {
  "Dating": `
CONTEXT: Dating.
PHASES:
1. Intro — name, city, what their daily life actually looks like
2. Who they are in a relationship — how they show affection, what they need, what they've learned
3. What they actually want — not the polished version, the real one
4. Dealbreakers + 1 controversial question
Weave in a second controversial question anywhere it fits naturally.`,

  "Friendship": `
CONTEXT: Friendship.
PHASES:
1. Their world — name, city, what fills their time, what they care about
2. How they connect — what a good friend looks like to them, how they show up
3. What they value in people and time
4. What's been missing + 1 controversial question
Weave in a second controversial question naturally.`,

  "Co-founder": `
CONTEXT: Co-founder search.
PHASES:
1. Their work — name, what they do, what they're building or want to build
2. Work style — how they make decisions, handle uncertainty, what their real strengths are (not pitch version)
3. Vision — what they're building toward, non-negotiables
4. Hard moments — conflict with collaborators, failed partnerships, what would make them walk away + 1 controversial question
Weave in a second controversial question naturally. Focus on professional chemistry and personality under pressure.`,

  "Wedding": `
CONTEXT: Marriage — they want a life partner.
PHASES:
1. Who they are — name, city, profession, what their life looks like, what they're proud of
2. Values & beliefs — what they won't compromise on, what family actually means to them
3. FAMILY DYNAMICS (ask all of these across multiple exchanges, one at a time):
   - Joint family vs nuclear family — what do they actually want, not what sounds acceptable
   - Relationship with their own parents — close? Complicated? How does that shape them?
   - In-laws: what are their honest expectations? Would they live with them? Under what circumstances?
   - Financial arrangement: combined money, separate, who handles what?
   - Children: yes/no/maybe, how many, when, how to raise them — values, schooling, religion if any
   - Whose career takes priority if there's a conflict?
   - Where to live: whose city, or a new place entirely?
4. How they do relationships — conflict style, what a real partnership looks like, what they've learned + 1 controversial question
Weave in a second controversial question naturally. This is the most thorough interview — don't rush phase 3.`,

  "Still Figuring Out": `
CONTEXT: Still figuring it out.
PHASES:
1. Their life right now — name, city, what's going on
2. What pulls them — what they're drawn to in people, what has felt right before
3. What matters — values, things they want more of, things they're done with
4. Openness — what they'd say yes to + 1 controversial question
Weave in a second controversial question naturally. Help them discover what they actually want — don't push a label.`,
};

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY) {
    return Response.json({ error: 'Request too large.' }, { status: 413 })
  }

  // No session on this endpoint — every call is a metered Claude request,
  // so this is the only thing stopping an unauthenticated cost-DoS loop.
  const rl = rateLimit(`match-interview:${ip(request)}`, 10 * 60_000, 20, 30 * 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const { history, relationshipType } = await request.json() as {
      sessionId: string;
      relationshipType: string;
      history: Array<{ role: string; text: string }>;
    };

    const typeContext = TYPE_CONTEXT[relationshipType] || TYPE_CONTEXT["Still Figuring Out"];

    const messages = history.map((m) => ({
      role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

    // Prompt caching: system prompt cached at Anthropic for 5 min.
    // Each interview has ~15 turns — caching saves ~60% on system prompt tokens.
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        { type: "text", text: BASE, cache_control: { type: "ephemeral" } },
        { type: "text", text: typeContext, cache_control: { type: "ephemeral" } },
      ],
      messages,
    } as Parameters<typeof client.messages.create>[0]) as Awaited<ReturnType<typeof client.messages.create>> & { content: Array<{type: string; text: string}> };

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    let step = estimateStep(history.length);
    let profileReady = false;
    let profile: Record<string, string> | null = null;

    if (reply.includes("[PROFILE_READY]")) {
      profileReady = true;
      step = 4;
      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) profile = JSON.parse(jsonMatch[0]);
      } catch { /* non-critical */ }
    }

    const cleanReply = reply.replace("[PROFILE_READY]", "").replace(/\{[\s\S]*\}/, "").trim();
    return Response.json({ reply: cleanReply, step, profileReady, profile });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

function estimateStep(msgCount: number): number {
  if (msgCount <= 2)  return 0;
  if (msgCount <= 6)  return 1;
  if (msgCount <= 10) return 2;
  if (msgCount <= 14) return 3;
  return 4;
}
