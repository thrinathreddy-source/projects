import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { animate } from "@/lib/projects";
import { nudgeQueue } from "@/lib/nudge";

export const dynamic = "force-dynamic";
// This route carries a queue tick in `after()`; see `lib/nudge.ts`.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * Approve the still and buy motion.
 *
 * Deliberately its own endpoint rather than something the still step triggers:
 * this is the expensive decision, and it should require the user to make it.
 */
export const POST = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  await enforce("projects.render", user.id);

  const result = await animate({ id: user.id, planCode: user.planCode }, id);
  nudgeQueue();

  return ok(result, { status: 202 });
});
