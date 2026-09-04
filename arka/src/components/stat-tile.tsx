import { cn } from "@/lib/utils";

/** A single number with its label. Used across the dashboard and admin. */
export function StatTile({
  label,
  value,
  hint,
  accent,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
