import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { get, remove } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  return ok(await get(user.id, id));
});

export const DELETE = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  await remove(user.id, id);
  return ok({ deleted: true });
});
