import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runRetention } from "@/lib/retention";
import { putObject, storage } from "@/lib/storage";
import { makeUser, resetDatabase } from "../../test/helpers";

/**
 * Housekeeping, which nothing did until now.
 *
 * The risk here is entirely one-sided: deleting too little costs a slightly
 * larger storage bill, deleting too much destroys work somebody paid for. Most
 * of these cases are therefore about what retention must *not* touch.
 */

beforeEach(resetDatabase);

const DAY = 24 * 60 * 60 * 1000;

async function makeProject(userId: string, overrides: { deletedAt?: Date } = {}) {
  const project = await db.project.create({
    data: {
      userId,
      title: "Test",
      prompt: "a lantern festival on a river at dusk",
      style: "mythic",
      setting: "dravidian",
      deletedAt: overrides.deletedAt,
    },
  });
  return project.id;
}

/** A video row with real bytes behind it, so deletion is observable. */
async function makeVideo(
  projectId: string,
  tier: "PREVIEW" | "FINAL",
  ageDays: number,
) {
  const key = `renders/test/${projectId}/${tier.toLowerCase()}-video.mp4`;
  await putObject(key, Buffer.from(`${tier} bytes`), "video/mp4");

  const video = await db.video.create({
    data: {
      id: `${projectId}-${tier}`,
      projectId,
      tier,
      status: "READY",
      storageKey: key,
    },
  });

  await db.$executeRaw`
    UPDATE "video" SET "createdAt" = ${new Date(Date.now() - ageDays * DAY)}
     WHERE "id" = ${video.id}
  `;

  return key;
}

describe("superseded previews", () => {
  it("deletes an old preview once the full-quality render exists", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user);
    const previewKey = await makeVideo(projectId, "PREVIEW", 45);
    const finalKey = await makeVideo(projectId, "FINAL", 40);

    const result = await runRetention();

    expect(result.previewsPurged).toBe(1);
    expect(await storage().get(previewKey)).toBeNull();
    // The row survives so the project's history and the cost analytics still
    // reconcile — only the bytes go.
    expect(
      (await db.video.findUniqueOrThrow({ where: { id: `${projectId}-PREVIEW` } }))
        .storageKey,
    ).toBeNull();

    // The thing the customer actually bought is untouched.
    expect(await storage().get(finalKey)).not.toBeNull();
  });

  it("leaves a preview alone when there is no final render", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user);
    const previewKey = await makeVideo(projectId, "PREVIEW", 45);

    expect((await runRetention()).previewsPurged).toBe(0);
    expect(await storage().get(previewKey)).not.toBeNull();
  });

  /** Inside the grace window the preview is still the thing being watched. */
  it("leaves a recent preview alone even once a final exists", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user);
    const previewKey = await makeVideo(projectId, "PREVIEW", 2);
    await makeVideo(projectId, "FINAL", 1);

    expect((await runRetention()).previewsPurged).toBe(0);
    expect(await storage().get(previewKey)).not.toBeNull();
  });
});

describe("orphans from a soft delete", () => {
  /**
   * `projects.remove` deletes the bytes inline, outside the transaction that
   * marks the row. A process that dies between the two leaves objects nothing
   * would ever look at again.
   */
  it("cleans up objects a failed delete left behind", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user, { deletedAt: new Date(Date.now() - 30 * DAY) });
    const key = await makeVideo(projectId, "PREVIEW", 30);

    const stillKey = `renders/test/${projectId}/still-video.png`;
    await putObject(stillKey, Buffer.from("still bytes"), "image/png");
    await db.project.update({ where: { id: projectId }, data: { stillKey } });

    expect((await runRetention()).orphansPurged).toBe(1);

    expect(await storage().get(key)).toBeNull();
    expect(await storage().get(stillKey)).toBeNull();
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).stillKey,
    ).toBeNull();
  });

  it("leaves a recently deleted project inside its grace window", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user, { deletedAt: new Date() });
    const key = await makeVideo(projectId, "PREVIEW", 1);

    expect((await runRetention()).orphansPurged).toBe(0);
    expect(await storage().get(key)).not.toBeNull();
  });
});

describe("the render cache", () => {
  async function makeCacheEntry(hash: string, idleDays: number) {
    await db.renderCache.create({
      data: {
        paramsHash: hash,
        storageKey: `renders/test/${hash}/preview-video.mp4`,
        provider: "mock",
        model: "mock/placeholder",
        lastUsedAt: new Date(Date.now() - idleDays * DAY),
      },
    });
  }

  it("drops entries nobody has used in months", async () => {
    await makeCacheEntry("cold", 90);
    await makeCacheEntry("warm", 3);

    expect((await runRetention()).cacheEntriesPruned).toBe(1);
    expect(await db.renderCache.count()).toBe(1);
  });

  /**
   * A cache row points at an object owned by somebody's project. Evicting the
   * row must never take the object with it — that would delete a customer's
   * video to save a fraction of a cent.
   */
  it("never deletes the object a pruned entry pointed at", async () => {
    const user = await makeUser();
    const projectId = await makeProject(user);
    const key = await makeVideo(projectId, "PREVIEW", 90);

    await db.renderCache.create({
      data: {
        paramsHash: "cold",
        storageKey: key,
        provider: "mock",
        model: "mock/placeholder",
        lastUsedAt: new Date(Date.now() - 90 * DAY),
      },
    });

    await runRetention();

    expect(await db.renderCache.count()).toBe(0);
    expect(await storage().get(key)).not.toBeNull();
  });
});

describe("logs", () => {
  it("prunes old system logs and keeps recent ones", async () => {
    await db.systemLog.createMany({
      data: [
        { level: "info", scope: "api", message: "old" },
        { level: "info", scope: "api", message: "recent" },
      ],
    });
    await db.$executeRaw`
      UPDATE "system_log" SET "createdAt" = ${new Date(Date.now() - 60 * DAY)}
       WHERE "message" = 'old'
    `;

    expect((await runRetention()).systemLogsPruned).toBe(1);

    // Counting rows would also count the row the retention pass writes about
    // itself, so assert on the two this test actually placed.
    const remaining = await db.systemLog.findMany({
      where: { message: { in: ["old", "recent"] } },
      select: { message: true },
    });
    expect(remaining.map((row) => row.message)).toEqual(["recent"]);
  });
});
