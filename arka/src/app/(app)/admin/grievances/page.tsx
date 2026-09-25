import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { Scale } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ResolveGrievance } from "@/components/admin/resolve-grievance";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getGrievanceCategory } from "@/lib/grievance-catalog";

export const metadata: Metadata = { title: "Grievances · Admin" };
export const dynamic = "force-dynamic";

/**
 * Complaints filed through /grievance, on the clock.
 *
 * Open ones sort by deadline, soonest first, because the order that matters is
 * the order the law will judge them in. Closed ones follow, newest first, so
 * the record of what was decided stays one scroll away.
 */
export default async function AdminGrievancesPage() {
  const [open, closed] = await Promise.all([
    db.grievance.findMany({
      where: { status: "OPEN" },
      orderBy: { dueAt: "asc" },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    db.grievance.findMany({
      where: { status: { not: "OPEN" } },
      orderBy: { resolvedAt: "desc" },
      take: 50,
    }),
  ]);

  const now = new Date();
  const overdue = open.filter((item) => item.dueAt < now).length;

  return (
    <PageBody className="max-w-3xl space-y-4">
      <div>
        <h2 className="section-label">Grievances</h2>
        <p className="text-sm text-muted-foreground">
          {open.length === 0
            ? "Nothing open."
            : `${open.length} open${overdue > 0 ? `, ${overdue} past deadline` : ""}. Soonest deadline first. Take content down from Projects, then record the outcome here.`}
        </p>
      </div>

      {open.length === 0 && closed.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No complaints yet"
          description="Anything filed through the public form at /grievance appears here with its deadline."
        />
      ) : null}

      {open.length > 0 ? (
        <ul className="space-y-3">
          {open.map((item) => {
            const late = item.dueAt < now;
            return (
              <li
                key={item.id}
                className={`rounded-lg border p-4 ${late ? "border-destructive" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{item.reference}</span>
                  <Badge variant={late ? "destructive" : "default"}>
                    {late
                      ? `overdue ${formatDistanceToNow(item.dueAt)}`
                      : `due ${formatDistanceToNow(item.dueAt, { addSuffix: true })}`}
                  </Badge>
                  {item.acknowledgedAt ? null : (
                    <Badge variant="outline">not acknowledged</Badge>
                  )}
                  <span className="ml-auto">
                    filed {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </span>
                </div>

                <p className="mt-2 text-sm font-medium">
                  {getGrievanceCategory(item.category)?.label ?? item.category}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.name ? `${item.name} · ` : ""}
                  {item.email}
                  {item.user ? ` · signed in as ${item.user.email}` : ""}
                </p>

                {item.contentUrl ? (
                  <p className="mt-2 text-xs break-all">
                    <a
                      href={item.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-4"
                    >
                      {item.contentUrl}
                    </a>
                  </p>
                ) : null}

                <p className="mt-3 rounded bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {item.message}
                </p>

                <div className="mt-3">
                  <ResolveGrievance id={item.id} acknowledged={Boolean(item.acknowledgedAt)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {closed.length > 0 ? (
        <>
          <h3 className="section-label pt-4">Closed</h3>
          <ul className="space-y-2">
            {closed.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card/50 p-4 opacity-80">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{item.reference}</span>
                  <Badge variant="secondary">{item.status.toLowerCase()}</Badge>
                  <span>{getGrievanceCategory(item.category)?.label ?? item.category}</span>
                  {item.resolvedAt ? (
                    <span className="ml-auto">
                      {item.resolvedAt > item.dueAt ? "late · " : ""}
                      closed {formatDistanceToNow(item.resolvedAt, { addSuffix: true })}
                    </span>
                  ) : null}
                </div>
                {item.resolution ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                    {item.resolution}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </PageBody>
  );
}
