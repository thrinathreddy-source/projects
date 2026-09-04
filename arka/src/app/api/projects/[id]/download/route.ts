import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { safeFilename, signedDownloadUrl } from "@/lib/storage";
import { track } from "@/lib/server-analytics";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const querySchema = z.object({
  tier: z.enum(["PREVIEW", "FINAL"]).default("PREVIEW"),
});

/**
 * Redirects to a short-lived signed URL rather than streaming the file.
 *
 * Streaming would route every megabyte of every download through our compute
 * budget; redirecting hands the transfer to R2, where egress is free.
 */
export const GET = handler("api", async (request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const { tier } = parseQuery(request, querySchema);

  const project = await db.project.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: {
      title: true,
      videos: { where: { tier, status: "READY" }, take: 1 },
    },
  });

  if (!project) throw notFound("Project not found.");

  const video = project.videos[0];
  if (!video?.storageKey) {
    throw new AppError("NOT_FOUND", "There is no finished render to download yet.");
  }

  const extension = video.storageKey.split(".").pop() || "mp4";
  const filename = safeFilename(project.title, extension);

  await track(user.id, "video_downloaded", { projectId: id, tier });

  const target = await signedDownloadUrl(video.storageKey, filename);

  // R2 hands back an absolute URL; the local driver returns an app-relative
  // path, and `NextResponse.redirect` rejects those.
  return NextResponse.redirect(new URL(target, request.url));
});
