"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

export function ResolveFeedback({ id, resolved }: { id: string; resolved: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onToggle() {
    setPending(true);
    try {
      await api.patch(`/api/admin/feedback/${id}`, { resolved: !resolved });
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onToggle} disabled={pending}>
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : resolved ? (
        <Undo2 className="size-3.5" />
      ) : (
        <Check className="size-3.5" />
      )}
      {resolved ? "Reopen" : "Mark handled"}
    </Button>
  );
}
