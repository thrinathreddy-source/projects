"use client";

import { useState } from "react";
import { GenerateForm, type PlanLimits } from "@/components/generate/generate-form";
import { RenderPanel } from "@/components/generate/render-panel";
import { GENERATION_DEFAULTS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/**
 * The workbench.
 *
 * Controls scroll on the left; the plate stays pinned on the right, because the
 * thing you are making should never leave the screen while you adjust how it is
 * made.
 *
 * On a phone the two stack, and which one leads depends on whether there is
 * anything to look at. Once a render exists the plate goes first, because that
 * is the whole point and the controls are what you scroll to. Before then it
 * would be a full screen of "nothing drawn yet" sitting on top of the only
 * thing a new user can actually do — so the form leads until there is a render.
 */
export function GenerateWorkspace({
  plan,
  balance,
}: {
  plan: PlanLimits;
  balance: number;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>(GENERATION_DEFAULTS.aspectRatio);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <div className={cn(projectId ? "order-2" : "order-1", "lg:order-1")}>
        <GenerateForm
          plan={plan}
          balance={balance}
          onQueued={setProjectId}
          onAspectRatioChange={setAspectRatio}
        />
      </div>

      <div
        className={cn(
          projectId ? "order-1" : "order-2",
          "lg:order-2 lg:sticky lg:top-6 lg:self-start",
        )}
      >
        <RenderPanel
          projectId={projectId}
          aspectRatio={aspectRatio}
          allowMotion={plan.allowMotion}
          onReset={() => setProjectId(null)}
        />
      </div>
    </div>
  );
}
