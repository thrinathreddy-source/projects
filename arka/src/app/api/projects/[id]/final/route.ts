import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { requestFinal } from "@/lib/projects";
import { nudgeQueue } from "@/lib/nudge";

export const dynamic = "force-dynamic";
// This route carries a queue tick in `after()`; see `lib/nudge.ts`.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Queue the full-quality render of an already-previewed project. */
export const POST = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  await enforce("projects.render", user.id);

  const result = await requestFinal({ id: user.id, planCode: user.planCode }, id);
  nudgeQueue();

  return ok(result, { status: 202 });
});
