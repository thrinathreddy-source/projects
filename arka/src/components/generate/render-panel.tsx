"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Download, Film, Loader2, RotateCcw, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { track } from "@/components/analytics-provider";
import { getAspectRatio } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { VideoPlayer } from "@/components/generate/video-player";
import { Dharmachakra } from "@/components/motifs";
import { cn } from "@/lib/utils";

/**
 * The plate — where the render appears.
 *
 * Built around the two-stage pipeline rather than hiding it: the rail at the top
 * shows which stage you are in, because the difference between them is the
 * difference between spending four credits and spending seventy. A user who does
 * not understand that distinction will resent the bill.
 */

type Status =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "STILL_READY"
  | "READY"
  | "FAILED"
  | "CANCELLED";

type ProjectStatus = {
  id: string;
  status: Status;
  progress: number;
  errorMessage: string | null;
  stillUrl: string | null;
  stillApproved: boolean;
  videos: { id: string; tier: string; url: string | null; thumbnailUrl: string | null }[];
};

const POLL_MS = 2_000;

/**
 * A dropped poll must not end the poll loop.
 *
 * The render carries on server-side regardless — the queue does not care
 * whether anyone is watching — so giving up on the first failed request froze
 * the UI on a stale frame during the thirty seconds the user is watching most
 * closely, and the only way out was a manual reload.
 *
 * Backing off also matters now that the endpoint is rate limited: a 429 met
 * with an immediate retry is how a client turns a brief limit into a long one.
 */
const POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

/** Give up only after the backoff is exhausted — roughly a minute of silence. */
const MAX_POLL_FAILURES = POLL_BACKOFF_MS.length;

export function RenderPanel({
  projectId,
  aspectRatio,
  allowMotion,
  onReset,
}: {
  projectId: string | null;
  aspectRatio: string;
  allowMotion: boolean;
  onReset: () => void;
}) {
  const router = useRouter();
  const [polled, setPolled] = useState<{ id: string; data: ProjectStatus } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const state = polled && polled.id === projectId ? polled.data : null;

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;

    async function poll() {
      try {
        const result = await api.get<ProjectStatus>(`/api/projects/${projectId}/status`);
        if (!active) return;

        failures = 0;
        setPolled({ id: projectId!, data: result });

        if (result.status === "QUEUED" || result.status === "RUNNING") {
          timer = setTimeout(poll, POLL_MS);
          return;
        }
        // STILL_READY is terminal for the poller — a human decides what happens.
        router.refresh();
        if (result.status === "READY") track("generation_completed", { projectId });
      } catch (error) {
        if (!active) return;

        failures += 1;

        if (failures < MAX_POLL_FAILURES) {
          // Stay quiet while retrying. A toast per dropped request would turn
          // one flaky minute into a stack of identical errors, and the render
          // is very probably fine.
          timer = setTimeout(poll, POLL_BACKOFF_MS[failures - 1]);
          return;
        }

        // Out of retries: now it is worth saying, and worth saying that the
        // render itself is still running.
        toast.error(messageFor(error), {
          description: "Still rendering — reload to pick the progress back up.",
        });
      }
    }

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projectId, router, busy]);

  async function act(path: string, label: string, key: string) {
    if (!projectId) return;
    setBusy(key);
    try {
      await api.post(`/api/projects/${projectId}/${path}`);
      toast.success(label);
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      // Clearing this re-runs the poll effect, which picks up the new job.
      setBusy(null);
    }
  }

  const ratio = getAspectRatio(aspectRatio);
  const stage = !state
    ? 0
    : state.status === "READY"
      ? 2
      : state.status === "STILL_READY"
        ? 1
        : state.stillApproved
          ? 2
          : 1;

  return (
    <div className="space-y-4">
      <StageRail stage={stage} />

      <div
        className="grain relative flex items-center justify-center overflow-hidden border-2 border-border bg-card"
        style={{ aspectRatio: `${ratio.width} / ${ratio.height}` }}
      >
        <Frame state={state} />
      </div>

      <Actions
        state={state}
        projectId={projectId}
        allowMotion={allowMotion}
        busy={busy}
        onAct={act}
        onReset={onReset}
      />
    </div>
  );
}

/** Which stage you are in, and what it costs. */
function StageRail({ stage }: { stage: number }) {
  const steps = [
    { n: "01", label: "Still", note: "cheap" },
    { n: "02", label: "Motion", note: "the expensive part" },
  ];

  return (
    <div className="flex items-stretch gap-px border border-border bg-border">
      {steps.map((step, index) => {
        const active = stage === index + 1;
        const done = stage > index + 1;
        return (
          <div
            key={step.n}
            className={cn(
              "flex-1 bg-background px-3 py-2 transition-colors",
              active && "bg-vermilion",
              done && "bg-card",
            )}
          >
            <p className={cn("annotation", active ? "text-ink/70" : "text-muted-foreground")}>
              {step.n} · {step.note}
            </p>
            <p
              className={cn(
                "poster text-lg",
                active ? "text-ink" : done ? "text-cyan" : "text-foreground",
              )}
            >
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Frame({ state }: { state: ProjectStatus | null }) {
  if (!state) {
    return (
      <div className="px-8 text-center">
        <Dharmachakra className="mx-auto mb-5 w-16 opacity-25" />
        <p className="annotation text-muted-foreground">Nothing drawn yet</p>
      </div>
    );
  }

  if (state.status === "READY") {
    const video = state.videos.find((v) => v.tier === "FINAL") ?? state.videos[0];
    if (video?.url) return <VideoPlayer src={video.url} poster={video.thumbnailUrl} />;
  }

  if (state.status === "STILL_READY" && state.stillUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- expiring signed URL
      <img src={state.stillUrl} alt="Generated still" className="h-full w-full object-contain" />
    );
  }

  if (state.status === "FAILED" || state.status === "CANCELLED") {
    return (
      <div className="px-8 text-center">
        <AlertCircle className="mx-auto mb-4 size-7 text-destructive" />
        <p className="poster text-2xl">
          {state.status === "CANCELLED" ? "Cancelled" : "That failed"}
        </p>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {state.errorMessage ?? "Your credits have been returned."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full px-10 text-center">
      <Dharmachakra className="mx-auto mb-6 w-14 animate-spin [animation-duration:8s]" />
      <div className="h-0.5 w-full overflow-hidden bg-muted">
        <div
          className="h-full bg-vermilion transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(5, state.progress)}%` }}
        />
      </div>
      <p className="annotation mt-4 text-cyan">
        {state.status === "QUEUED" ? "Queued" : "Drawing"} · {state.progress}%
      </p>
    </div>
  );
}

function Actions({
  state,
  projectId,
  allowMotion,
  busy,
  onAct,
  onReset,
}: {
  state: ProjectStatus | null;
  projectId: string | null;
  allowMotion: boolean;
  busy: string | null;
  onAct: (path: string, label: string, key: string) => void;
  onReset: () => void;
}) {
  if (!projectId || !state) return null;

  if (state.status === "QUEUED" || state.status === "RUNNING") {
    return (
      <Button
        variant="ghost"
        className="w-full rounded-none"
        disabled={busy !== null}
        onClick={() => onAct("cancel", "Cancelled. Credits returned.", "cancel")}
      >
        <X className="size-4" />
        Cancel and refund
      </Button>
    );
  }

  if (state.status === "STILL_READY") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-px border border-border bg-border">
          {allowMotion ? (
            <Button
              className="rounded-none"
              disabled={busy !== null}
              onClick={() => onAct("animate", "Animating your still.", "animate")}
            >
              {busy === "animate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Film className="size-4" />
              )}
              Animate
            </Button>
          ) : (
            <ButtonLink href="/billing" className="rounded-none">
              <Film className="size-4" />
              Upgrade to animate
            </ButtonLink>
          )}
          <Button
            variant="outline"
            className="rounded-none border-0"
            disabled={busy !== null}
            onClick={() => onAct("still", "Drawing another.", "reroll")}
          >
            {busy === "reroll" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shuffle className="size-4" />
            )}
            Try another
          </Button>
        </div>
        <p className="annotation text-center text-muted-foreground">
          Re-rolling is cheap · animating is not
        </p>
      </div>
    );
  }

  if (state.status === "READY") {
    return (
      <div className="grid grid-cols-3 gap-px border border-border bg-border">
        <ButtonLink
          href={`/api/projects/${projectId}/download?tier=PREVIEW`}
          className="rounded-none"
        >
          <Download className="size-4" />
          Download
        </ButtonLink>
        <ButtonLink
          href={`/projects/${projectId}`}
          variant="outline"
          className="rounded-none border-0"
        >
          Open
        </ButtonLink>
        <Button variant="ghost" className="rounded-none" onClick={onReset}>
          <RotateCcw className="size-4" />
          New
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" className="w-full rounded-none" onClick={onReset}>
      <RotateCcw className="size-4" />
      Start again
    </Button>
  );
}
