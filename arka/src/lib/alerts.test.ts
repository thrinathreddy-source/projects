import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { collectSignals, runAlerts } from "@/lib/alerts";
import { enqueue } from "@/lib/queue";
import { makeProject, makeUser, resetDatabase } from "../../test/helpers";

/**
 * Alerting is only worth having if it is quiet when things are fine and loud
 * exactly once when they are not. Both halves are tested here: a healthy system
 * must produce nothing, and a broken one must not mail on every tick.
 *
 * ADMIN_EMAILS is unset under test, so `runAlerts` exercises the cooldown and
 * the queries without anything leaving the process.
 */

beforeEach(resetDatabase);

async function makeQueuedJob(runAfter: Date) {
  const user = await makeUser(500);
  const projectId = await makeProject(user);
  const job = await enqueue({ projectId, type: "GENERATE_PREVIEW", creditsHeld: 10 });
  await db.job.update({ where: { id: job.id }, data: { runAfter } });
  return job;
}

describe("silence when healthy", () => {
  it("reports nothing on an empty system", async () => {
    expect(await collectSignals()).toEqual([]);
  });

  it("does not complain about work that only just became eligible", async () => {
    await makeQueuedJob(new Date(Date.now() - 60_000));

    expect(await collectSignals()).toEqual([]);
  });
});

describe("a queue nobody is draining", () => {
  /**
   * The signal that catches a dead scheduler — the failure where every page
   * still loads and no video is ever produced.
   */
  it("fires once work has sat past the grace period", async () => {
    await makeQueuedJob(new Date(Date.now() - 30 * 60_000));

    const signals = await collectSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ key: "queue.stalled", severity: "critical" });
  });

  it("counts deferred work too, since a stuck deferral is the budget guard failing open", async () => {
    const job = await makeQueuedJob(new Date(Date.now() - 30 * 60_000));
    await db.job.update({ where: { id: job.id }, data: { status: "DEFERRED" } });

    expect((await collectSignals())[0]?.key).toBe("queue.stalled");
  });
});

describe("failure rate", () => {
  async function finishJobs(status: "FAILED" | "SUCCEEDED", count: number) {
    const user = await makeUser(2_000);
    for (let index = 0; index < count; index += 1) {
      const projectId = await makeProject(user);
      const job = await enqueue({ projectId, type: "GENERATE_PREVIEW", creditsHeld: 10 });
      await db.job.update({
        where: { id: job.id },
        data: { status, completedAt: new Date() },
      });
    }
  }

  it("ignores a small sample, however bad it looks", async () => {
    await finishJobs("FAILED", 3);

    expect(await collectSignals()).toEqual([]);
  });

  it("fires when most of a real sample failed", async () => {
    await finishJobs("FAILED", 8);
    await finishJobs("SUCCEEDED", 2);

    const signal = (await collectSignals()).find((s) => s.key === "generation.failureRate");
    expect(signal?.summary).toContain("80%");
  });

  it("stays quiet when failures are a minority", async () => {
    await finishJobs("FAILED", 2);
    await finishJobs("SUCCEEDED", 8);

    expect(await collectSignals()).toEqual([]);
  });
});

describe("the resend cooldown", () => {
  /**
   * A stuck queue is still stuck on the next tick. Without the cooldown an
   * outage would mail every fifteen minutes until we learned to ignore it.
   */
  it("mails the first time and suppresses the repeat", async () => {
    await makeQueuedJob(new Date(Date.now() - 30 * 60_000));

    const first = await runAlerts();
    expect(first.mailed).toEqual(["queue.stalled"]);
    expect(first.suppressed).toEqual([]);

    const second = await runAlerts();
    expect(second.mailed).toEqual([]);
    expect(second.suppressed).toEqual(["queue.stalled"]);

    // Still detected — suppression is about delivery, not about the signal.
    expect(second.signals[0]?.key).toBe("queue.stalled");
  });

  it("lets a signal mail again once the window has passed", async () => {
    await makeQueuedJob(new Date(Date.now() - 30 * 60_000));
    await runAlerts();

    // Backdate the claim beyond the cooldown.
    await db.appSetting.update({
      where: { key: "alert.lastSent.queue.stalled" },
      data: { value: Math.floor(Date.now() / 1000) - 7_200 },
    });

    expect((await runAlerts()).mailed).toEqual(["queue.stalled"]);
  });

  /** Two overlapping ticks must not both decide they are the one to send. */
  it("mails once when two checks run at the same moment", async () => {
    await makeQueuedJob(new Date(Date.now() - 30 * 60_000));

    const runs = await Promise.all([runAlerts(), runAlerts()]);
    const mailed = runs.flatMap((run) => run.mailed);

    expect(mailed).toEqual(["queue.stalled"]);
  });
});
