import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runTick } from "@/lib/worker";
import { enqueue } from "@/lib/queue";
import { reserve } from "@/lib/credits";
import { balanceOf, expectLedgerBalances, makeUser, resetDatabase } from "../../test/helpers";

/**
 * The pipeline, end to end, against the mock provider.
 *
 * The mock exists precisely so this is possible: it travels the identical path
 * a paid vendor does — dispatch, poll, fetch, store, settle — so a test that
 * drives it is testing the real worker rather than a rehearsal of one.
 *
 * `worker.ts` was the largest untested file in the codebase and the one where
 * the two worst bugs lived. Both are pinned below.
 */

beforeEach(resetDatabase);

type ProjectOverrides = Partial<{
  prompt: string;
  style: string;
  durationSec: number;
  voiceId: string;
  stillKey: string;
}>;

async function makeProjectFor(userId: string, overrides: ProjectOverrides = {}) {
  const project = await db.project.create({
    data: {
      userId,
      title: "Test",
      prompt: overrides.prompt ?? "a lantern festival on a river at dusk",
      style: overrides.style ?? "mythic",
      setting: "dravidian",
      durationSec: overrides.durationSec ?? 5,
      voiceId: overrides.voiceId ?? "none",
      stillKey: overrides.stillKey,
      status: "QUEUED",
    },
  });
  return project.id;
}

async function makeJobFor(
  userId: string,
  projectId: string,
  type: "GENERATE_STILL" | "GENERATE_PREVIEW" | "GENERATE_FINAL",
  credits = 10,
) {
  const job = await enqueue({ projectId, type, creditsHeld: credits });
  await reserve(userId, credits, { type: "job", id: job.id });
  return job;
}

/**
 * Run a job all the way to a finished render.
 *
 * The mock reports a job as running for nine seconds, which is right for a
 * person watching a progress bar and wrong for a test. Its handle carries its
 * own start time, so backdating that lands the next poll on the success path
 * without waiting.
 */
async function dispatchThenComplete(jobId: string) {
  // One tick to dispatch; the job comes back holding a real mock handle.
  await runTick("test");

  const dispatched = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  expect(dispatched.providerJobId).toBeTruthy();

  // Backdate it so the next poll sees a finished render, and clear the poll
  // delay the dispatch step set.
  const [, , payload] = dispatched.providerJobId!.split("_");
  await db.job.update({
    where: { id: jobId },
    data: {
      providerJobId: `mock_${Date.now() - 60_000}_${payload}`,
      runAfter: new Date(Date.now() - 1_000),
    },
  });

  await runTick("test");
}

describe("the still step", () => {
  it("renders, stores and parks the project for a human decision", async () => {
    const user = await makeUser(200);
    const projectId = await makeProjectFor(user);
    const job = await makeJobFor(user, projectId, "GENERATE_STILL", 4);

    await runTick("test");

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("STILL_READY");
    expect(project.stillKey).toBeTruthy();
    // Nothing advances to motion on its own — that is the whole pricing model.
    expect(project.stillApprovedAt).toBeNull();

    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      "SUCCEEDED",
    );
    expect((await balanceOf(user)).creditsHeld).toBe(0);
    await expectLedgerBalances(user);
  });

  /**
   * Stills were being filed as PREVIEW, which collapsed the two halves of the
   * pipeline into one row type. The gap between them is the entire pricing
   * argument — an image costs a hundredth of a motion render — so a margin
   * table that cannot separate them cannot answer the question it exists for.
   */
  it("records its spend against the STILL tier, not PREVIEW", async () => {
    const user = await makeUser(200);
    const projectId = await makeProjectFor(user);
    await makeJobFor(user, projectId, "GENERATE_STILL", 4);

    await runTick("test");

    const generation = await db.generation.findFirstOrThrow({ where: { projectId } });
    expect(generation.tier).toBe("STILL");
  });
});

describe("the motion pipeline", () => {
  it("dispatches, polls, stores the render and settles the hold", async () => {
    const user = await makeUser(500);
    const projectId = await makeProjectFor(user);
    const job = await makeJobFor(user, projectId, "GENERATE_PREVIEW", 70);

    await dispatchThenComplete(job.id);

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).toBe("READY");
    expect(project.progress).toBe(100);

    const video = await db.video.findFirstOrThrow({ where: { projectId } });
    expect(video.status).toBe("READY");
    expect(video.storageKey).toBeTruthy();

    // The hold becomes a spend only now.
    expect((await balanceOf(user)).creditsHeld).toBe(0);
    await expectLedgerBalances(user);
  });

  /**
   * The finish step is the one genuinely expensive thing a worker does: pull
   * the render into memory, encode it, upload it. Being killed halfway through
   * means the provider has been paid and the work is gone, and on a serverless
   * host that is what happens when the invocation runs out of time.
   *
   * So it must not be started without room to complete it. The provider's
   * result does not expire between ticks, which is what makes handing the job
   * straight back a free thing to do.
   */
  it("hands the job back rather than starting a finish it cannot complete", async () => {
    const user = await makeUser(500);
    const projectId = await makeProjectFor(user);
    const job = await makeJobFor(user, projectId, "GENERATE_PREVIEW", 70);

    await runTick("test");

    const dispatched = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    const [, , payload] = dispatched.providerJobId!.split("_");
    await db.job.update({
      where: { id: job.id },
      data: {
        providerJobId: `mock_${Date.now() - 60_000}_${payload}`,
        runAfter: new Date(Date.now() - 1_000),
      },
    });

    // A budget that covers claiming a job but not finishing one.
    const result = await runTick("test", { budgetMs: 9_000 });

    expect(result.deferredForTime).toBe(1);

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.status).not.toBe("READY");

    // Still queued, still holding the credits, ready for the next tick.
    const after = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("QUEUED");
    expect(after.providerJobId).toBeTruthy();
    expect((await balanceOf(user)).creditsHeld).toBe(70);

    // And the next tick, with room, finishes it.
    await db.job.update({
      where: { id: job.id },
      data: { runAfter: new Date(Date.now() - 1_000) },
    });
    await runTick("test");

    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe("READY");
    await expectLedgerBalances(user);
  });
});

describe("the render cache", () => {
  const IDENTICAL = {
    prompt: "a lantern festival on a river at dusk",
    style: "mythic",
    durationSec: 5,
  };

  it("serves a repeat render back to the same user for nothing", async () => {
    const user = await makeUser(500);

    const first = await makeProjectFor(user, IDENTICAL);
    const firstJob = await makeJobFor(user, first, "GENERATE_PREVIEW", 70);
    await dispatchThenComplete(firstJob.id);

    const second = await makeProjectFor(user, IDENTICAL);
    const secondJob = await makeJobFor(user, second, "GENERATE_PREVIEW", 70);
    await runTick("test");

    expect((await db.job.findUniqueOrThrow({ where: { id: secondJob.id } })).status).toBe(
      "SUCCEEDED",
    );

    const hit = await db.generation.findFirstOrThrow({
      where: { projectId: second },
    });
    expect(hit.cacheHit).toBe(true);
    expect(hit.costUsdMicro).toBe(0);
  });

  /**
   * A global cache is cheaper and was the wrong trade.
   *
   * With a fixed style catalogue and short prompts, two customers typing the
   * same thing is not a corner case — and both would have received the
   * byte-identical clip, and both would have posted it. Selling someone a video
   * of their story means it has to be theirs.
   */
  it("never serves one user's render to another", async () => {
    const alice = await makeUser(500);
    const bob = await makeUser(500);

    const hers = await makeProjectFor(alice, IDENTICAL);
    const herJob = await makeJobFor(alice, hers, "GENERATE_PREVIEW", 70);
    await dispatchThenComplete(herJob.id);

    const his = await makeProjectFor(bob, IDENTICAL);
    const hisJob = await makeJobFor(bob, his, "GENERATE_PREVIEW", 70);
    await runTick("test");

    // Bob's job went to the provider rather than being served Alice's file.
    const dispatched = await db.job.findUniqueOrThrow({ where: { id: hisJob.id } });
    expect(dispatched.providerJobId).toBeTruthy();

    const generations = await db.generation.findMany({ where: { projectId: his } });
    expect(generations.every((row) => !row.cacheHit)).toBe(true);
  });
});
