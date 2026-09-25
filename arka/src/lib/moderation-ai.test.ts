import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Configured for this file only, before anything reads the environment.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
});

import { db } from "@/lib/db";
import { decide, screenText } from "@/lib/moderation-ai";
import { enforceModeration, flagForReview } from "@/lib/moderation-server";
import { makeProject, makeUser, resetDatabase } from "../../test/helpers";

/**
 * The second reader.
 *
 * Two properties matter. It must refuse only what no retelling of an epic ever
 * needs — so a battle, a slaying or a burning city stays renderable however the
 * model scores it. And it must never be the reason the product stops: any
 * failure lets the request through to the layers underneath.
 */

const fetchMock = vi.fn<typeof fetch>();

function moderationReply(categories: Record<string, boolean>) {
  return new Response(
    JSON.stringify({
      id: "modr-test",
      model: "omni-moderation-latest",
      results: [{ flagged: Object.values(categories).some(Boolean), categories }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(async () => {
  await resetDatabase();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Test files share a worker process. Leaving the key set would make every
// later suite try to reach OpenAI on each generation it creates.
afterAll(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("what it decides", () => {
  it("lets the canon through: plain violence is never grounds to refuse or review", () => {
    expect(decide({ violence: true, harassment: true, illicit: true })).toEqual({
      outcome: "allow",
    });
  });

  it("refuses sexual content, anything sexualising a minor, and threats against a group", () => {
    expect(decide({ "sexual/minors": true, sexual: true })).toMatchObject({
      outcome: "block",
      category: "sexual/minors",
    });
    expect(decide({ sexual: true })).toMatchObject({ outcome: "block", category: "sexual" });
    expect(decide({ "hate/threatening": true, hate: true })).toMatchObject({
      outcome: "block",
      category: "hate/threatening",
    });
  });

  it("asks for a person's eye on the ambiguous categories instead of refusing", () => {
    for (const category of ["hate", "harassment/threatening", "violence/graphic", "self-harm/intent"]) {
      expect(decide({ [category]: true })).toEqual({ outcome: "review", category });
    }
  });
});

describe("calling the model", () => {
  it("sends the text and returns the decision", async () => {
    fetchMock.mockResolvedValueOnce(moderationReply({ sexual: true }));

    const result = await screenText("some text");

    expect(result).toMatchObject({ outcome: "block", category: "sexual" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "omni-moderation-latest",
      input: "some text",
    });
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test-not-a-real-key",
    );
  });

  it("does not call out for empty text", async () => {
    expect(await screenText("   ")).toEqual({ outcome: "allow" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails open when the model errors, times out or answers nonsense", async () => {
    fetchMock.mockResolvedValueOnce(new Response("overloaded", { status: 503 }));
    expect(await screenText("a")).toEqual({ outcome: "skipped", reason: "error" });

    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    expect(await screenText("a")).toEqual({ outcome: "skipped", reason: "error" });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    expect(await screenText("a")).toEqual({ outcome: "skipped", reason: "error" });
  });
});

describe("in the enforcement path", () => {
  /**
   * The reason this layer exists. The word lists cannot read Tamil script, and
   * the narration is spoken exactly as written.
   */
  it("refuses a narration script the word lists cannot read", async () => {
    fetchMock.mockResolvedValueOnce(moderationReply({ sexual: true }));
    const userId = await makeUser(0);

    await expect(
      enforceModeration(
        { title: "கதை", prompt: "a village at dusk, lamps being lit", script: "தமிழ் உரை" },
        userId,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", details: { policy: "ai.sexual" } });
  });

  it("runs the word lists first, so their specific message wins and no call is made", async () => {
    const userId = await makeUser(0);

    await expect(
      enforceModeration({ prompt: "a deepfake of the prime minister, photorealistic" }, userId),
    ).rejects.toMatchObject({ details: { policy: "likeness.realPerson" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a request through, and raises nothing, when the model is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const userId = await makeUser(0);

    await expect(
      enforceModeration({ prompt: "Hanuman leaps across the sea to Lanka" }, userId),
    ).resolves.toEqual({ review: null });
  });

  it("passes a review verdict through to the review queue without calling twice", async () => {
    fetchMock.mockResolvedValueOnce(moderationReply({ "violence/graphic": true, violence: true }));
    const userId = await makeUser(0);
    const projectId = await makeProject(userId);
    const input = { prompt: "Durga slays Mahishasura on the battlefield" };

    const outcome = await enforceModeration(input, userId);
    expect(outcome).toEqual({ review: "ai.violence/graphic" });

    await flagForReview(input, { userId, projectId }, outcome.review);

    const items = await db.reviewItem.findMany({ where: { projectId } });
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe("ai.violence/graphic");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
