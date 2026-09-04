import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock, Film } from "lucide-react";
import { getAspectRatio, getStyle } from "@/lib/catalog";
import { StatusPill } from "@/components/projects/status-pill";
import { cn } from "@/lib/utils";

export type ProjectCardData = {
  id: string;
  title: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  durationSec: number;
  status: string;
  progress: number;
  createdAt: Date | string;
  thumbnailUrl: string | null;
};

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const style = getStyle(project.style);
  const ratio = getAspectRatio(project.aspectRatio);
  const created =
    typeof project.createdAt === "string" ? new Date(project.createdAt) : project.createdAt;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-input"
    >
      <div
        className="relative flex items-center justify-center overflow-hidden bg-muted/40"
        style={{ aspectRatio: `${ratio.width} / ${ratio.height}`, maxHeight: 260 }}
      >
        {project.thumbnailUrl ? (
          // Expiring signed URL; next/image cannot optimise or cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${style.accent}22, transparent 70%)`,
            }}
          >
            <Film className="size-6 text-muted-foreground/40" />
          </div>
        )}

        <div className="absolute top-2 left-2">
          <StatusPill status={project.status} progress={project.progress} />
        </div>
      </div>

      <div className="min-w-0 space-y-1.5 p-3">
        <p className="truncate text-sm font-medium">{project.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{project.prompt}</p>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
          <span
            className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5")}
            style={{ backgroundColor: `${style.accent}1f`, color: style.accent }}
          >
            {style.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {project.durationSec}s
          </span>
          <span className="ml-auto shrink-0">
            {formatDistanceToNow(created, { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  );
}
