import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ResolveReview } from "@/components/admin/resolve-review";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Review · Admin" };
export const dynamic = "force-dynamic";

/**
 * The queue between "refused automatically" and "somebody complained".
 *
 * Nothing here was blocked — every item rendered and was delivered. These are
 * the cases a word-level filter has to guess about, surfaced so the guess can
 * be checked by a person instead of by a customer.
 */
export default async function AdminReviewPage() {
  const items = await db.reviewItem.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      user: { select: { email: true, planCode: true } },
      project: { select: { id: true, title: true, status: true } },
    },
  });

  const pending = items.filter((item) => item.status === "PENDING");

  return (
    <PageBody className="max-w-3xl space-y-4">
      <div>
        <h2 className="section-label">Flagged for review</h2>
        <p className="text-sm text-muted-foreground">
          {pending.length === 0
            ? "Nothing waiting. These render normally — the flag only asks for a second look."
            : `${pending.length} waiting. Nothing here was blocked; each one rendered and was delivered.`}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing flagged"
          description="Generations that touch sensitive ground will appear here for a second look."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.status === "PENDING" ? "default" : "secondary"}>
                      {item.status.toLowerCase()}
                    </Badge>
                    <span className="annotation text-muted-foreground">{item.reason}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.user.email} · {item.project?.title ?? "project deleted"}
                  </p>
                </div>

                {item.status === "PENDING" ? <ResolveReview id={item.id} /> : null}
              </div>

              {item.excerpt ? (
                <p className="mt-3 rounded bg-muted/40 p-3 text-sm text-muted-foreground">
                  {item.excerpt}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
