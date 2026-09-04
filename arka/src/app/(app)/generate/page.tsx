import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/page-header";
import { GenerateWorkspace } from "@/components/generate/generate-workspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireUserPage } from "@/lib/session";
import { getBalance } from "@/lib/credits";
import { planFor } from "@/lib/projects";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Generate" };
export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const user = await requireUserPage("/generate");
  const [balance, plan, settings] = await Promise.all([
    getBalance(user.id),
    planFor(user.planCode),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Generate"
        description="Describe one moment. Draw the still. Animate it when it is right."
      />

      <PageBody className="max-w-6xl">
        {!settings["flags.generationEnabled"] ? (
          <Alert className="mb-6">
            <AlertDescription>
              Rendering is paused for maintenance right now. You can still queue
              nothing — check back shortly.
            </AlertDescription>
          </Alert>
        ) : null}

        <GenerateWorkspace
          plan={{
            code: plan.code,
            name: plan.name,
            maxDurationSec: plan.maxDurationSec,
            allowFinal: plan.allowFinal,
            allowMotion: plan.allowMotion,
          }}
          balance={balance.credits}
        />
      </PageBody>
    </>
  );
}
