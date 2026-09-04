import { z } from "zod";
import { handler, ok, parseBody, parseQuery, toPage } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { generationInputSchema } from "@/lib/catalog";
import { create, list } from "@/lib/projects";
import { nudgeQueue } from "@/lib/nudge";
import { signedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
// This route carries a queue tick in `after()`; see `lib/nudge.ts`.
export const maxDuration = 60;

const createSchema = generationInputSchema.extend({
  clientToken: z.string().max(64).optional(),
});

export const POST = handler("api", async (request: Request) => {
  const user = await requireUser();
  await enforce("projects.create", user.id);
  const body = await parseBody(request, createSchema);

  const project = await create({ id: user.id, planCode: user.planCode }, body);

  // Start work immediately rather than waiting for the next cron tick.
  nudgeQueue();

  return ok({ id: project.id, status: project.status }, { status: 201 });
});

const listSchema = z.object({
  status: z.enum(["all", "READY", "FAILED", "RUNNING"]).default("all"),
  search: z.string().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = handler("api", async (request: Request) => {
  const user = await requireUser();
  await enforce("api.read", user.id);
  const query = parseQuery(request, listSchema);

  const rows = await list(user.id, query);
  const page = toPage(rows, query.limit);

  const items = await Promise.all(
    page.items.map(async (project) => {
      const best = project.videos[0];
      return {
        id: project.id,
        title: project.title,
        prompt: project.prompt,
        style: project.style,
        language: project.language,
        aspectRatio: project.aspectRatio,
        durationSec: project.durationSec,
        status: project.status,
        progress: project.progress,
        createdAt: project.createdAt,
        hasFinal: project.videos.some((video) => video.tier === "FINAL"),
        thumbnailUrl: best?.thumbnailKey ? await signedUrl(best.thumbnailKey) : null,
      };
    }),
  );

  return ok({ items, nextCursor: page.nextCursor });
});
