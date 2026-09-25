import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { acknowledgeGrievance, decideGrievance } from "@/lib/grievances";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("acknowledge") }),
  z.object({
    action: z.enum(["resolve", "dismiss"]),
    resolution: z.string().trim().min(10, "Write the outcome in a sentence or two.").max(5000),
  }),
]);

/**
 * Act on one grievance: acknowledge it by hand, or close it with a reason.
 *
 * Taking the content itself down happens through the project tools, as it
 * does for the review queue; this records the decision and tells the
 * complainant.
 */
export const POST = handler("admin", async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  if (body.action === "acknowledge") {
    await acknowledgeGrievance(id, admin.id);
    return ok({ acknowledged: true });
  }

  const result = await decideGrievance(id, body.action, body.resolution, admin.id);
  return ok(result);
});
