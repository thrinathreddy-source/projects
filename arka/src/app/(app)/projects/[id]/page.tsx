import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { StatusPill } from "@/components/projects/status-pill";
import { ProjectActions } from "@/components/projects/project-actions";
import { VideoPlayer } from "@/components/generate/video-player";
import { ButtonLink } from "@/components/ui/button-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUserPage } from "@/lib/session";
import { get, planFor } from "@/lib/projects";
import { costOf } from "@/lib/credits";
import { getAspectRatio, getStyle, LANGUAGES, VOICES } from "@/lib/catalog";
import { isAppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requireUserPage();
  const { id } = await params;

  try {
    const project = await get(user.id, id);
    return { title: project.title };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectPage({ params }: Props) {
  const user = await requireUserPage();
  const { id } = await params;

  let project: Awaited<ReturnType<typeof get>>;
  try {
    project = await get(user.id, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [plan, finalCredits] = await Promise.all([
    planFor(user.planCode),
    costOf({ durationSec: project.durationSec, tier: "FINAL", voiceId: project.voiceId }),
  ]);

  const style = getStyle(project.style);
  const ratio = getAspectRatio(project.aspectRatio);
  const language = LANGUAGES.find((item) => item.id === project.language);
  const voice = VOICES.find((item) => item.id === project.voiceId);

  const finalVideo = project.videos.find(
    (video) => video.tier === "FINAL" && video.status === "READY",
  );
  const previewVideo = project.videos.find(
    (video) => video.tier === "PREVIEW" && video.status === "READY",
  );
  const displayed = finalVideo ?? previewVideo;
  const active = project.status === "QUEUED" || project.status === "RUNNING";

  return (
    <PageBody className="max-w-5xl space-y-6">
      <ButtonLink href="/projects" variant="ghost" size="sm" className="-ml-2">
        <ArrowLeft className="size-4" />
        Projects
      </ButtonLink>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Player -------------------------------------------------------- */}
        <div className="space-y-4">
          <div
            className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-card"
            style={{ aspectRatio: `${ratio.width} / ${ratio.height}` }}
          >
            {displayed?.url ? (
              <VideoPlayer
                src={displayed.url}
                poster={displayed.thumbnailUrl}
                autoPlay={false}
              />
            ) : active ? (
              <div className="w-full px-8 text-center">
                <Loader2 className="mx-auto mb-4 size-6 animate-spin text-primary" />
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700"
                    style={{ width: `${Math.max(4, project.progress)}%` }}
                  />
                </div>
                <p className="mt-3 text-sm">
                  {project.status === "QUEUED" ? "Queued" : "Rendering"}
                </p>
              </div>
            ) : (
              <div className="px-6 text-center">
                <AlertCircle className="mx-auto mb-3 size-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No render available.</p>
              </div>
            )}
          </div>

          <ProjectActions
            projectId={project.id}
            status={project.status}
            hasPreview={Boolean(previewVideo)}
            hasFinal={Boolean(finalVideo)}
            canRenderFinal={plan.allowFinal}
            finalCredits={finalCredits}
          />
        </div>

        {/* Details ------------------------------------------------------- */}
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={project.status} progress={project.progress} />
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(project.createdAt, { addSuffix: true })}
              </span>
            </div>
            <h1 className="title-soft text-2xl">{project.title}</h1>
          </div>

          {project.status === "FAILED" && project.errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>
                {project.errorMessage} Your credits have been returned.
              </AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground">Prompt</h2>
            <p className="rounded-lg border border-border bg-card p-3 text-sm leading-relaxed">
              {project.prompt}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground">Settings</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm sm:grid-cols-3">
              <Detail label="Style" value={style.label} />
              <Detail label="Format" value={`${ratio.label} · ${ratio.id}`} />
              <Detail label="Duration" value={`${project.durationSec}s`} />
              <Detail label="Language" value={language?.label ?? project.language} />
              <Detail label="Narration" value={voice?.label ?? project.voiceId} />
              <Detail
                label="Quality"
                value={finalVideo ? "Full quality" : "Preview"}
              />
            </dl>
          </section>
        </div>
      </div>
    </PageBody>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}
