import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { remove } from "@/lib/projects";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["clear", "remove"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Resolve one review item.
 *
 * "Remove" deletes the project through the same path a user's own delete takes,
 * so the bytes actually go rather than the row merely being marked.
 *
 * The excerpt is cleared on resolution either way. It was kept so a reviewer
 * could judge the case; holding the worst thing somebody typed indefinitely
 * creates a liability rather than removing one.
 */
export const POST = handler("api", async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  const item = await db.reviewItem.findUnique({ where: { id } });
  if (!item) throw notFound("No such review item.");

  if (body.action === "remove" && item.projectId) {
    await remove(item.userId, item.projectId);
  }

  await db.reviewItem.update({
    where: { id },
    data: {
      status: body.action === "remove" ? "REMOVED" : "CLEARED",
      resolvedBy: admin.id,
      resolvedAt: new Date(),
      note: body.note,
      excerpt: "",
    },
  });

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: `review.${body.action}`,
      targetType: "review_item",
      targetId: id,
      meta: { reason: item.reason, projectId: item.projectId, note: body.note },
    },
  });

  logger.event("api", `Review ${body.action}ed`, { id, reason: item.reason });
  return ok({ status: body.action === "remove" ? "REMOVED" : "CLEARED" });
});
