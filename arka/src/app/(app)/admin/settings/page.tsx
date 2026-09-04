import type { Metadata } from "next";
import { format } from "date-fns";
import { PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { getSettings, settingsMetadata } from "@/lib/settings";
import { auditTrail } from "@/lib/admin";

export const metadata: Metadata = { title: "Settings · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, audit] = await Promise.all([getSettings(), auditTrail(25)]);

  const fields = settingsMetadata().map((field) => ({
    ...field,
    value: settings[field.key],
  }));

  return (
    <PageBody className="max-w-3xl space-y-10">
      <SettingsForm fields={fields} />

      <section className="space-y-3">
        <h2 className="section-label">Audit trail</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border text-sm">
            {audit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2 px-4 py-2.5">
                <span className="text-muted-foreground">
                  {format(entry.createdAt, "d MMM, HH:mm")}
                </span>
                <span className="font-mono text-xs leading-6">{entry.action}</span>
                <span className="text-muted-foreground">
                  {entry.targetType}:{entry.targetId}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {entry.actor?.email ?? "system"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageBody>
  );
}
