import { after } from "next/server";
import { runTick } from "@/lib/worker";
import { allow } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Drive the queue from the request path.
 *
 * A dedicated scheduler is the obvious design and the wrong one for a
 * bootstrapped MVP: Vercel's cron floor is a minute, which would make a
 * 10-second render feel like a 70-second one. Instead, the requests already
 * happening — submitting a generation, polling its progress — each run a queue
 * tick after the response is sent. The user watching their own render is the
 * thing that advances it, at zero infrastructure cost.
 *
 * The cron in `vercel.json` still runs, for jobs nobody is watching.
 *
 * Two things bound what this can cost. A global throttle, because the tick is
 * shared work and the tenth caller in a second adds nothing the first nine did
 * not already do; and the tick's own time budget, because `after()` runs inside
 * the request's function invocation and inherits its timeout.
 */

/**
 * Leave room under the route's `maxDuration` for the response itself.
 *
 * Every route that calls this declares `maxDuration = 60`, which is the lowest
 * ceiling any Vercel plan offers. The worker's own default is sized for the
 * same limit; this is here to make the coupling explicit rather than implied.
 */
const NUDGE_BUDGET_MS = 45_000;

export function nudgeQueue(): void {
  after(async () => {
    try {
      // Shared work, so a burst of pollers should not become a burst of ticks.
      // Skipping is the correct response — the caller's own request already
      // succeeded, and whatever this tick would have done, the next one does.
      if (!(await allow("queue.tick", "global"))) return;

      await runTick(`web-${Math.random().toString(36).slice(2, 8)}`, {
        budgetMs: NUDGE_BUDGET_MS,
      });
    } catch (error) {
      // Never surface this: the response has already been sent, and the cron
      // will pick up whatever this tick missed.
      logger.warn("worker", "Background tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
