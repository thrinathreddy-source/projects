"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
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

/** Take down someone else's project — abuse, a takedown notice, a support ask. */
export function DeleteProjectButton({
  projectId,
  title,
  owner,
}: {
  projectId: string;
  title: string;
  owner: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setPending(true);
    try {
      await api.delete(`/api/admin/projects/${projectId}`);
      toast.success("Project deleted.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${title}`}
            disabled={pending}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This belongs to {owner}. The video files are deleted permanently and
            they will not be able to recover them. Their credits are not
            refunded — do that separately from the Users tab if it is warranted.
            The action is recorded in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete permanently</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
