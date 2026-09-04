import { handler, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/api-auth";
import { enforce } from "@/lib/rate-limit";
import { get, remove } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Poll a generation. Signed URLs appear once the render is READY. */
export const GET = handler("api", async (request: Request, context: Context) => {
  const user = await requireApiUser(request);
  await enforce("api.read", user.id);
  const { id } = await context.params;

  const project = await get(user.id, id);

  return ok({
    id: project.id,
    title: project.title,
    prompt: project.prompt,
    script: project.script,
    status: project.status,
    progress: project.progress,
    error: project.errorMessage,
    style: project.style,
    language: project.language,
    voiceId: project.voiceId,
    aspectRatio: project.aspectRatio,
    durationSec: project.durationSec,
    createdAt: project.createdAt,
    renders: project.videos
      .filter((video) => video.status === "READY")
      .map((video) => ({
        tier: video.tier,
        url: video.url,
        thumbnailUrl: video.thumbnailUrl,
        audioUrl: video.audioUrl,
        width: video.width,
        height: video.height,
        durationSec: video.durationSec,
        hasAudio: video.hasAudio,
      })),
  });
});

export const DELETE = handler("api", async (request: Request, context: Context) => {
  const user = await requireApiUser(request);
  await enforce("api.write", user.id);
  const { id } = await context.params;
  await remove(user.id, id);
  return ok({ deleted: true });
});
