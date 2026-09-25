import { ok, handler } from "@/lib/api";
import { assertCronRequest } from "@/lib/cron-auth";
import { runTick } from "@/lib/worker";

/**
 * Scheduled queue tick.
 *
 * Most work is driven opportunistically — the generate and status endpoints
 * nudge the queue as the user watches, so a render progresses without any
 * scheduler at all. This exists for the cases nobody is watching: deferred
 * jobs waiting on tomorrow's budget, and leases abandoned by a crashed worker.
 */

export const dynamic = "force-dynamic";

/**
 * 60 is the lowest ceiling any Vercel plan imposes, so it is what the worker's
 * time budget is sized against. Raising this without raising
 * `WORKER_TICK_BUDGET_MS` buys nothing — the tick stops on its own clock.
 */
export const maxDuration = 60;

export const GET = handler("worker", async (request: Request) => {
  assertCronRequest(request);

  const result = await runTick(`cron-${crypto.randomUUID().slice(0, 8)}`);
  return ok(result);
});
