import type { Metadata } from "next";
import { format } from "date-fns";
import { PageBody } from "@/components/page-header";
import { StatusPill } from "@/components/projects/status-pill";
import { DeleteProjectButton } from "@/components/admin/delete-project-button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { getStyle } from "@/lib/catalog";

export const metadata: Metadata = { title: "Projects · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminProjectsPage({
  searchParams,
}: PageProps<"/admin/projects">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";

  const projects = await db.project.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { prompt: { contains: search, mode: "insensitive" as const } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: { select: { email: true } } },
  });

  return (
    <PageBody className="space-y-5">
      <div>
        <h2 className="section-label">Projects</h2>
        <p className="text-sm text-muted-foreground">
          For takedowns and support requests. Deletions are audited.
        </p>
      </div>

      <form className="max-w-sm">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Search title, prompt or owner email"
        />
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nothing matches that.
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <span className="block max-w-64 truncate font-medium">
                      {project.title}
                    </span>
                    <span className="block max-w-64 truncate text-xs text-muted-foreground">
                      {project.prompt}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.user.email}
                  </TableCell>
                  <TableCell>{getStyle(project.style).label}</TableCell>
                  <TableCell>
                    <StatusPill status={project.status} progress={project.progress} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(project.createdAt, "d MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <DeleteProjectButton
                      projectId={project.id}
                      title={project.title}
                      owner={project.user.email}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </PageBody>
  );
}
