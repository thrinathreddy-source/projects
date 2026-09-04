import { cn } from "@/lib/utils";

const STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  QUEUED: { label: "Queued", className: "bg-secondary text-secondary-foreground" },
  RUNNING: { label: "Rendering", className: "bg-primary/15 text-primary" },
  READY: { label: "Ready", className: "bg-success/15 text-success" },
  FAILED: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

export function StatusPill({
  status,
  progress,
  className,
}: {
  status: string;
  progress?: number;
  className?: string;
}) {
  const config = STYLES[status] ?? STYLES.DRAFT;
  const showProgress = status === "RUNNING" && typeof progress === "number";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur",
        config.className,
        className,
      )}
    >
      {status === "RUNNING" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {config.label}
      {showProgress ? <span className="tabular-nums">{progress}%</span> : null}
    </span>
  );
}
