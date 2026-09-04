import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { remove } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Take down a project on someone else's behalf — abuse, DMCA, support request. */
export const DELETE = handler("admin", async (_request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;

  const project = await db.project.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project) throw notFound("Project not found.");

  await remove(project.userId, id);

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: "project.delete",
      targetType: "project",
      targetId: id,
      meta: { ownerId: project.userId },
    },
  });

  return ok({ deleted: true });
});
