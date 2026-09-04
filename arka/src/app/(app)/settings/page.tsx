import type { Metadata } from "next";
import { format } from "date-fns";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { ApiKeys } from "@/components/settings/api-keys";
import { DangerZone } from "@/components/settings/danger-zone";
import { Separator } from "@/components/ui/separator";
import { ButtonLink } from "@/components/ui/button-link";
import { requireUserPage } from "@/lib/session";
import { planFor } from "@/lib/projects";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUserPage("/settings");
  const [plan, account] = await Promise.all([
    planFor(user.planCode),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { createdAt: true },
    }),
  ]);

  const apiEnabled = plan.code === "studio" || user.role === "admin";

  return (
    <>
      <PageHeader title="Settings" description="Your account and access." />

      <PageBody className="max-w-2xl space-y-10">
        <section className="space-y-4">
          <div>
            <h2 className="section-label">Profile</h2>
            <p className="text-sm text-muted-foreground">
              Member since {format(account.createdAt, "MMMM yyyy")}.
            </p>
          </div>
          <ProfileForm
            initial={{ name: user.name, email: user.email, country: user.country }}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="section-label">Plan</h2>
              <p className="text-sm text-muted-foreground">
                You are on {plan.name} — {plan.monthlyCredits.toLocaleString("en-IN")}{" "}
                credits a month, up to {plan.maxDurationSec}-second clips.
              </p>
            </div>
            <ButtonLink href="/billing" variant="outline" size="sm">
              Manage
            </ButtonLink>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h2 className="section-label">API keys</h2>
            <p className="text-sm text-muted-foreground">
              Send them as{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                Authorization: Bearer …
              </code>
              . Treat them like passwords.
            </p>
          </div>
          <ApiKeys enabled={apiEnabled} />
        </section>

        <Separator />

        <DangerZone email={user.email} />
      </PageBody>
    </>
  );
}
