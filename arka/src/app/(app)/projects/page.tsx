import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectsBrowser } from "@/components/projects/projects-browser";
import { ButtonLink } from "@/components/ui/button-link";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Everything you have generated."
        actions={
          <ButtonLink href="/generate" size="lg">
            <Sparkles className="size-4" />
            New video
          </ButtonLink>
        }
      />

      <PageBody>
        <ProjectsBrowser />
      </PageBody>
    </>
  );
}
