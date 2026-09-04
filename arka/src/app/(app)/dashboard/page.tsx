import type { Metadata } from "next";
import { Film, Sparkles, Wallet } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { ButtonLink } from "@/components/ui/button-link";
import { requireUserPage } from "@/lib/session";
import { getBalance } from "@/lib/credits";
import { userStats } from "@/lib/stats";
import { list, planFor } from "@/lib/projects";
import { signedUrl } from "@/lib/storage";
import { formatCredits, formatNumber } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUserPage("/dashboard");

  const [balance, stats, plan, recent] = await Promise.all([
    getBalance(user.id),
    userStats(user.id),
    planFor(user.planCode),
    list(user.id, { limit: 8, status: "all" }),
  ]);

  const projects = await Promise.all(
    recent.slice(0, 8).map(async (project) => ({
      id: project.id,
      title: project.title,
      prompt: project.prompt,
      style: project.style,
      aspectRatio: project.aspectRatio,
      durationSec: project.durationSec,
      status: project.status,
      progress: project.progress,
      createdAt: project.createdAt,
      thumbnailUrl: project.videos[0]?.thumbnailKey
        ? await signedUrl(project.videos[0].thumbnailKey)
        : null,
    })),
  );

  const firstName = user.name.split(" ")[0];

  /**
   * Credits are bought, not granted, so a brand-new account has none. Pointing
   * that account at the generator would be a dead end — it can compose a prompt
   * and then be refused. Send it to billing instead, and to the showcase, which
   * is what does the convincing now that nothing is given away.
   */
  const needsCredits = balance.credits === 0;

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={
          needsCredits
            ? "Add credits to start rendering."
            : stats.totalProjects === 0
              ? "Let's make your first clip."
              : `${plan.name} plan · ${formatCredits(balance.credits)} credits left`
        }
        actions={
          needsCredits ? (
            <ButtonLink href="/billing" size="lg">
              <Wallet className="size-4" />
              Add credits
            </ButtonLink>
          ) : (
            <ButtonLink href="/generate" size="lg">
              <Sparkles className="size-4" />
              New video
            </ButtonLink>
          )
        }
      />

      <PageBody className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Credits"
            value={formatCredits(balance.credits)}
            hint={
              balance.creditsHeld > 0
                ? `${formatCredits(balance.creditsHeld)} reserved`
                : `${plan.name} plan`
            }
            accent={balance.credits < 20}
          />
          <StatTile
            label="Videos made"
            value={formatNumber(stats.readyProjects)}
            hint={stats.inProgress > 0 ? `${stats.inProgress} in progress` : undefined}
          />
          <StatTile
            label="Seconds rendered"
            value={formatNumber(stats.secondsRendered)}
            hint="Across all time"
          />
          <StatTile
            label="Credits used"
            value={formatCredits(stats.creditsSpentThisMonth)}
            hint="This month"
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-label">Recent</h2>
            {projects.length > 0 ? (
              <ButtonLink href="/projects" variant="ghost" size="sm">
                View all
              </ButtonLink>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <EmptyState
              icon={needsCredits ? Wallet : Film}
              title={needsCredits ? "No credits yet" : "No videos yet"}
              description={
                needsCredits
                  ? "Credits are bought rather than granted, so nothing renders until you top up. Packs start at ₹299 — see the showcase first if you want to know what it makes."
                  : "Describe one moment from a story — a rooftop, a race, a battle — pick a style, and Arka renders it as an anime clip."
              }
              action={
                needsCredits ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <ButtonLink href="/billing">
                      <Wallet className="size-4" />
                      Add credits
                    </ButtonLink>
                    <ButtonLink href="/#showcase" variant="ghost">
                      See the showcase
                    </ButtonLink>
                  </div>
                ) : (
                  <ButtonLink href="/generate">
                    <Sparkles className="size-4" />
                    Make your first video
                  </ButtonLink>
                )
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
