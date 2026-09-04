import { z } from "zod";
import { handler, ok, parseBody, parseQuery, toPage } from "@/lib/api";
import { requireApiUser } from "@/lib/api-auth";
import { enforce } from "@/lib/rate-limit";
import { generationInputSchema } from "@/lib/catalog";
import { create, list } from "@/lib/projects";
import { nudgeQueue } from "@/lib/nudge";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
// This route carries a queue tick in `after()`; see `lib/nudge.ts`.
export const maxDuration = 60;

/**
 * Public API — generate a video.
 *
 * The same service layer the dashboard uses, so credits, plan limits,
 * concurrency caps and the budget guard all apply identically. There is no
 * second code path with a different set of rules.
 */

const createSchema = generationInputSchema.extend({
  clientToken: z.string().max(64).optional(),
});

export const POST = handler("api", async (request: Request) => {
  const user = await requireApiUser(request);
  await enforce("api.write", user.id);
  const body = await parseBody(request, createSchema);

  const project = await create({ id: user.id, planCode: user.planCode }, body);
  nudgeQueue();

  return ok(
    {
      id: project.id,
      status: project.status,
      // Polling target, so a caller does not have to construct it.
      url: `${publicEnv.appUrl}/api/v1/videos/${project.id}`,
    },
    { status: 202 },
  );
});

const listSchema = z.object({
  status: z.enum(["all", "READY", "FAILED", "RUNNING"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = handler("api", async (request: Request) => {
  const user = await requireApiUser(request);
  await enforce("api.read", user.id);
  const query = parseQuery(request, listSchema);

  const rows = await list(user.id, query);
  const page = toPage(rows, query.limit);

  return ok({
    items: page.items.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      progress: project.progress,
      durationSec: project.durationSec,
      style: project.style,
      language: project.language,
      createdAt: project.createdAt,
    })),
    nextCursor: page.nextCursor,
  });
});
