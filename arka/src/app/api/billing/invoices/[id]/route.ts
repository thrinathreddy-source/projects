import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { buildInvoice } from "@/lib/invoice";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * A customer's own tax invoice, by transaction id.
 *
 * Scoped to the caller inside `buildInvoice`, so an id from someone else's
 * account is a 404 rather than a leak of what they bought.
 */
export const GET = handler("billing", async (_request: Request, context: Context) => {
  const user = await requireUser();
  await enforce("api.read", user.id);
  const { id } = await context.params;

  return ok(await buildInvoice(user.id, id));
});
