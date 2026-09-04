import { cn } from "@/lib/utils";

/** Consistent page chrome: title, one line of context, optional actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-7 md:px-8",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="page-title text-4xl">{title}</h1>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 py-6 md:px-8", className)}>{children}</div>;
}
