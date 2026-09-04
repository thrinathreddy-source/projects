import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteAccount, exportAccountData } from "@/lib/account";
import { putObject, storage } from "@/lib/storage";
import { fulfilPayment } from "@/lib/billing";
import { makeUser, resetDatabase } from "../../test/helpers";

/**
 * The DPDP rights.
 *
 * The hard part is not deletion, it is deletion that stops short of destroying
 * records another law requires us to keep. Most of what follows asserts what
 * must *survive*.
 */

beforeEach(resetDatabase);

async function makeProjectWithBytes(userId: string) {
  const project = await db.project.create({
    data: {
      userId,
      title: "A lantern festival",
      prompt: "a lantern festival on a river at dusk",
      script: "something the user typed",
      style: "mythic",
      setting: "dravidian",
    },
  });

  const videoKey = `renders/${userId}/${project.id}/preview-video.mp4`;
  const stillKey = `renders/${userId}/${project.id}/still-video.png`;
  await putObject(videoKey, Buffer.from("video"), "video/mp4");
  await putObject(stillKey, Buffer.from("still"), "image/png");

  await db.video.create({
    data: { projectId: project.id, tier: "PREVIEW", status: "READY", storageKey: videoKey },
  });
  await db.project.update({ where: { id: project.id }, data: { stillKey } });

  return { projectId: project.id, videoKey, stillKey };
}

async function makePurchase(userId: string) {
  const order = await db.transaction.create({
    data: {
      userId, provider: "razorpay", purpose: "CREDIT_PACK", status: "CREATED",
      amountMinor: 49_900, currency: "INR", creditsGranted: 500,
      providerOrderId: `order_${Math.random().toString(36).slice(2, 12)}`,
    },
  });
  await fulfilPayment({
    providerOrderId: order.providerOrderId!,
    providerPaymentId: `pay_${order.id}`,
    amountMinor: 49_900,
  });
  return order.id;
}

describe("export", () => {
  it("returns the account, its projects and its money", async () => {
    const user = await makeUser(0);
    await makeProjectWithBytes(user);
    await makePurchase(user);

    const data = await exportAccountData(user);

    expect(data.account.id).toBe(user);
    expect(data.projects).toHaveLength(1);
    expect(data.transactions).toHaveLength(1);
    expect(data.creditLedger.length).toBeGreaterThan(0);
  });

  /** An export is a file people email themselves. It cannot carry credentials. */
  it("never includes an API key hash", async () => {
    const user = await makeUser(0);
    await db.apiKey.create({
      data: { userId: user, name: "test", prefix: "arka_sk_ab", hashedKey: "SECRET-HASH-VALUE" },
    });

    const data = await exportAccountData(user);
    expect(JSON.stringify(data)).not.toContain("SECRET-HASH-VALUE");
    expect(data.apiKeys[0]?.prefix).toBe("arka_sk_ab");
  });
});

describe("erasure", () => {
  it("deletes every stored object", async () => {
    const user = await makeUser(0);
    const { videoKey, stillKey } = await makeProjectWithBytes(user);

    const outcome = await deleteAccount(user);

    expect(outcome.objectsDeleted).toBe(2);
    expect(await storage().get(videoKey)).toBeNull();
    expect(await storage().get(stillKey)).toBeNull();
  });

  it("scrubs everything that identifies a person", async () => {
    const user = await makeUser(0);
    await makeProjectWithBytes(user);

    await deleteAccount(user);

    const after = await db.user.findUniqueOrThrow({ where: { id: user } });
    expect(after.name).toBe("Deleted account");
    expect(after.email).toContain("@deleted.invalid");
    expect(after.banned).toBe(true);

    // Prompts and scripts are free text and can contain anything.
    const project = await db.project.findFirstOrThrow({ where: { userId: user } });
    expect(project.prompt).toBe("");
    expect(project.script).toBeNull();
    expect(project.deletedAt).not.toBeNull();
  });

  /**
   * The whole reason this is not a hard delete. `transaction` and
   * `credit_ledger` cascade from `user`, so DELETE would destroy the financial
   * record Indian tax law requires be retained for years.
   */
  it("retains the financial record", async () => {
    const user = await makeUser(0);
    await makePurchase(user);

    const outcome = await deleteAccount(user);

    expect(await db.transaction.count({ where: { userId: user } })).toBe(1);
    expect(await db.creditLedger.count({ where: { userId: user } })).toBeGreaterThan(0);
    expect(outcome.financialRowsRetained).toBeGreaterThan(0);
  });

  it("ends every session and revokes API access immediately", async () => {
    const user = await makeUser(0);
    await db.session.create({
      data: {
        id: `s_${user}`, userId: user, token: `t_${user}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.apiKey.create({
      data: { userId: user, name: "k", prefix: "arka_sk_zz", hashedKey: "h" },
    });

    await deleteAccount(user);

    expect(await db.session.count({ where: { userId: user } })).toBe(0);
    expect(await db.apiKey.count({ where: { userId: user } })).toBe(0);
  });

  /**
   * Deleting the only admin locks the business out of its own admin surface,
   * and nothing in the product can undo it.
   */
  it("refuses to delete the last admin", async () => {
    const admin = await makeUser(0);
    await db.user.update({ where: { id: admin }, data: { role: "admin" } });

    await expect(deleteAccount(admin)).rejects.toMatchObject({ code: "CONFLICT" });

    // And allows it once another admin exists.
    const second = await makeUser(0);
    await db.user.update({ where: { id: second }, data: { role: "admin" } });
    await expect(deleteAccount(admin)).resolves.toBeTruthy();
  });

  it("drops cache entries pointing at the deleted user's objects", async () => {
    const user = await makeUser(0);
    const { videoKey } = await makeProjectWithBytes(user);
    await db.renderCache.create({
      data: { paramsHash: "h", storageKey: videoKey, provider: "mock", model: "m" },
    });

    await deleteAccount(user);

    expect(await db.renderCache.count()).toBe(0);
  });
});
