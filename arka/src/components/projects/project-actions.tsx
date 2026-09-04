"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { track } from "@/components/analytics-provider";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ProjectActions({
  projectId,
  status,
  hasPreview,
  hasFinal,
  canRenderFinal,
  finalCredits,
}: {
  projectId: string;
  status: string;
  hasPreview: boolean;
  hasFinal: boolean;
  canRenderFinal: boolean;
  finalCredits: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"final" | "cancel" | "delete" | null>(null);

  const active = status === "QUEUED" || status === "RUNNING";

  // Keep the server-rendered page in step with a render that is still running.
  useEffect(() => {
    if (!active) return;

    const timer = setInterval(() => router.refresh(), 3_000);
    return () => clearInterval(timer);
  }, [active, router]);

  async function onRenderFinal() {
    setBusy("final");
    try {
      await api.post(`/api/projects/${projectId}/final`);
      track("final_render_requested", { projectId });
      toast.success("Full-quality render queued.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    setBusy("cancel");
    try {
      await api.post(`/api/projects/${projectId}/cancel`);
      toast.success("Cancelled. Your credits have been returned.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    setBusy("delete");
    try {
      await api.delete(`/api/projects/${projectId}`);
      track("project_deleted", { projectId });
      toast.success("Project deleted.");
      router.push("/projects");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasPreview ? (
        <ButtonLink
          href={`/api/projects/${projectId}/download?tier=${hasFinal ? "FINAL" : "PREVIEW"}`}
        >
          <Download className="size-4" />
          Download
        </ButtonLink>
      ) : null}

      {hasPreview && !hasFinal && canRenderFinal && !active ? (
        <Button variant="outline" onClick={onRenderFinal} disabled={busy !== null}>
          {busy === "final" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Render full quality · {finalCredits} credits
        </Button>
      ) : null}

      {active ? (
        <Button variant="outline" onClick={onCancel} disabled={busy !== null}>
          {busy === "cancel" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
          Cancel
        </Button>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete project"
              disabled={busy !== null}
              className="ml-auto text-muted-foreground hover:text-destructive"
            />
          }
        >
          <Trash2 className="size-4" />
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              The video files are deleted permanently and cannot be recovered.
              Credits already spent are not refunded. Download it first if you
              want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
