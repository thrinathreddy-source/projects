import type { Metadata } from "next";
import { format } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recentFailures } from "@/lib/admin";

export const metadata: Metadata = { title: "Generations · Admin" };
export const dynamic = "force-dynamic";

/**
 * Failed generations, newest first.
 *
 * Worth a page of its own: a provider silently renaming an endpoint or
 * tightening a content filter shows up here first, as a run of identical error
 * codes, long before anyone writes in to complain.
 */
export default async function AdminGenerationsPage() {
  const failures = await recentFailures(100);

  return (
    <PageBody className="space-y-4">
      <div>
        <h2 className="section-label">Failed generations</h2>
        <p className="text-sm text-muted-foreground">
          Credits for every one of these were returned automatically.
        </p>
      </div>

      {failures.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No failures"
          description="Every generation on record succeeded."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(row.createdAt, "d MMM, HH:mm")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.user.email}
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-48 truncate">
                      {row.project?.title ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.project?.style ?? ""} · {row.tier.toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="block">{row.provider}</span>
                    <span className="block max-w-40 truncate font-mono text-xs text-muted-foreground">
                      {row.model}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="text-[10px]">
                      {row.errorCode ?? "UNKNOWN"}
                    </Badge>
                    <span className="mt-1 block max-w-80 truncate text-xs text-muted-foreground">
                      {row.errorText}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageBody>
  );
}
