"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, MailCheck, X } from "lucide-react";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = "acknowledge" | "resolve" | "dismiss";

/**
 * Close one grievance with a written outcome, or record a manual
 * acknowledgement. The outcome is emailed to the complainant, so the box says
 * so rather than looking like a private note.
 */
export function ResolveGrievance({ id, acknowledged }: { id: string; acknowledged: boolean }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);

  async function act(action: Action) {
    setBusy(action);
    try {
      const result = await api.post<{ notified?: boolean }>(
        `/api/admin/grievances/${id}`,
        action === "acknowledge" ? { action } : { action, resolution },
      );

      if (action === "acknowledge") {
        toast.success("Marked as acknowledged.");
      } else if (result.notified === false) {
        toast.warning("Closed, but the email to the complainant did not send. Write to them directly.");
      } else {
        toast.success(action === "resolve" ? "Resolved and complainant told." : "Dismissed and complainant told.");
      }
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  const ready = resolution.trim().length >= 10;

  return (
    <div className="space-y-2">
      <Label htmlFor={`resolution-${id}`} className="text-xs text-muted-foreground">
        Outcome — sent to the complainant
      </Label>
      <Textarea
        id={`resolution-${id}`}
        value={resolution}
        onChange={(event) => setResolution(event.target.value)}
        rows={3}
        maxLength={5000}
        placeholder="What you decided, and why."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy !== null || !ready} onClick={() => act("resolve")}>
          {busy === "resolve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Resolve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || !ready}
          onClick={() => act("dismiss")}
        >
          {busy === "dismiss" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          Dismiss
        </Button>
        {acknowledged ? null : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => act("acknowledge")}
          >
            {busy === "acknowledge" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MailCheck className="size-4" />
            )}
            I have acknowledged it by hand
          </Button>
        )}
      </div>
    </div>
  );
}
