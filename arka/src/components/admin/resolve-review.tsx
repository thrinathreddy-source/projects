"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Trash2 } from "lucide-react";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

/** Clear or remove one flagged generation. */
export function ResolveReview({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"clear" | "remove" | null>(null);

  async function act(action: "clear" | "remove") {
    setBusy(action);
    try {
      await api.post(`/api/admin/reviews/${id}`, { action });
      toast.success(action === "clear" ? "Cleared." : "Removed and deleted.");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("clear")}>
        {busy === "clear" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Clear
      </Button>
      <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => act("remove")}>
        {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Remove
      </Button>
    </div>
  );
}
