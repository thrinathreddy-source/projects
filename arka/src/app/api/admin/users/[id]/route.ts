import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { adjustCredits, setBanned } from "@/lib/admin";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ban"),
    banned: z.boolean(),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("credits"),
    // Bounded so a slipped keystroke cannot mint a fortune.
    delta: z.number().int().min(-100_000).max(100_000),
    note: z.string().trim().max(200).default("Admin adjustment"),
  }),
]);

export const POST = handler("admin", async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  if (body.action === "ban") {
    try {
      await setBanned(admin.id, id, body.banned, body.reason);
    } catch (error) {
      throw new AppError(
        "VALIDATION",
        error instanceof Error ? error.message : "Could not update this user.",
      );
    }
    return ok({ banned: body.banned });
  }

  await adjustCredits(admin.id, id, body.delta, body.note);
  return ok({ delta: body.delta });
});
