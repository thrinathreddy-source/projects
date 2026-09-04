"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
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

export function CancelSubscription({ planName }: { planName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onCancel() {
    setPending(true);
    try {
      await api.delete("/api/billing/subscription");
      toast.success("Cancelled. You keep everything until the period ends.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium">Cancel {planName}</p>
        <p className="text-xs text-muted-foreground">
          You keep your plan and credits until the current period ends.
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={pending}
            />
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Cancel plan
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your {planName} plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Your plan stays active until the end of the period you have paid
              for. Credits already in your balance are yours and do not expire.
              After that you drop to the Free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>Cancel plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
