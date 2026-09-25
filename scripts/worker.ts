import "dotenv/config";
import { runTick } from "../src/lib/worker";

/**
 * Standalone worker loop — `npm run worker`.
 *
 * Optional. The app drives its own queue from the request path, so this is for
 * local development where you want jobs to progress without a browser open,
 * and for running Arka on a normal server instead of serverless.
 */

const WORKER_ID = `local-${process.pid}`;
const IDLE_MS = 2_000;
const ERROR_BACKOFF_MS = 10_000;

/**
 * A long-lived process has no function timeout to fit inside, so the tick's
 * budget only needs to be short enough that shutdown stays responsive — the
 * signal handler waits for the current tick to finish.
 */
const TICK_BUDGET_MS = 300_000;

let running = true;

async function loop() {
  console.log(`[worker] ${WORKER_ID} started`);

  while (running) {
    try {
      const result = await runTick(WORKER_ID, { budgetMs: TICK_BUDGET_MS });

      if (result.claimed > 0 || result.reclaimed > 0 || result.deadLettered > 0) {
        console.log(
          `[worker] claimed=${result.claimed} reclaimed=${result.reclaimed} dead=${result.deadLettered} errors=${result.errors}`,
        );
      }

      // Only idle when there was nothing to do; a busy queue drains at full speed.
      if (result.claimed === 0) await sleep(IDLE_MS);
    } catch (error) {
      console.error("[worker] tick failed", error);
      await sleep(ERROR_BACKOFF_MS);
    }
  }

  console.log("[worker] stopped");
  process.exit(0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // Finish the current tick rather than abandoning a leased job mid-step.
    console.log(`[worker] ${signal} received, finishing current tick…`);
    running = false;
  });
}

void loop();
