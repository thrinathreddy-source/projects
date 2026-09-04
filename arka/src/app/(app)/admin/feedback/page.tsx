import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ResolveFeedback } from "@/components/admin/resolve-feedback";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Feedback · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const items = await db.feedback.findMany({
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { email: true, planCode: true } } },
  });

  return (
    <PageBody className="max-w-3xl space-y-4">
      <div>
        <h2 className="section-label">Feedback</h2>
        <p className="text-sm text-muted-foreground">
          Unresolved first. At this stage these are the most valuable words in
          the database.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No feedback yet"
          description="The widget is on every page — it will fill up."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.resolved ? "border-border bg-card/50 opacity-60" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.rating ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {item.rating}/5
                  </Badge>
                ) : null}
                <span>{item.user?.email ?? "signed out"}</span>
                {item.user?.planCode ? <span>· {item.user.planCode}</span> : null}
                {item.page ? <span>· {item.page}</span> : null}
                <span className="ml-auto">
                  {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                </span>
              </div>

              <p className="mt-2 text-sm whitespace-pre-wrap">{item.message}</p>

              <div className="mt-3">
                <ResolveFeedback id={item.id} resolved={item.resolved} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
