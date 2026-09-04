import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { revoke } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const DELETE = handler("api", async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  await revoke(user.id, id);
  return ok({ revoked: true });
});
