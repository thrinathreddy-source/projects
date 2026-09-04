import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { status } from "@/lib/projects";
import { nudgeQueue } from "@/lib/nudge";

export const dynamic = "force-dynamic";
// This route carries a queue tick in `after()`; see `lib/nudge.ts`.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * Progress poll for a running generation.
 *
 * Also advances the queue: the person waiting on a render is the one driving
 * it forward, which is what lets a 10-second job feel like 10 seconds without
 * a scheduler in the loop.
 *
 * That design is also why this is the most expensive read in the product, and
 * the one that most needs a limit. A client polls it every two seconds; a loop
 * with no client attached would otherwise run the worker for the whole system
 * as fast as it could issue requests.
 */
export const GET = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  await enforce("projects.status", user.id);
  const { id } = await context.params;

  const result = await status(user.id, id);

  if (result.status === "QUEUED" || result.status === "RUNNING") {
    nudgeQueue();
  }

  return ok(result);
});
