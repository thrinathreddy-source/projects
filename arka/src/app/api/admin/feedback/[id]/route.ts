import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({ resolved: z.boolean() });

export const PATCH = handler("admin", async (request: Request, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  await db.feedback.update({ where: { id }, data: { resolved: body.resolved } });
  return ok({ resolved: body.resolved });
});
