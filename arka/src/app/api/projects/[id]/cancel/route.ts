import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { cancel } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  await enforce("projects.mutate", user.id);
  await cancel(user.id, id);
  return ok({ cancelled: true });
});
