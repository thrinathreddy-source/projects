"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The two rights the DPDP Act gives every user, made reachable.
 *
 * A privacy policy that promises access and erasure while the product offers
 * neither is a promise that comes due the first time somebody asks. These are
 * the mechanisms behind it.
 */
export function DangerZone({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

  const matches = confirm.trim().toLowerCase() === email.toLowerCase();

  async function onDelete() {
    setBusy("delete");
    try {
      await api.post("/api/account/delete", { confirmEmail: confirm.trim() });
      toast.success("Your account has been deleted.");
      /**
       * A hard navigation on purpose, which is why the rule is disabled rather
       * than obeyed. `router.push` keeps the React tree and the cached RSC
       * payload alive, so a deleted account would briefly go on rendering its
       * own authenticated UI — balance, projects, plan — all of it gone
       * server-side. A full reload is the only thing that discards it.
       */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch (error) {
      toast.error(messageFor(error));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="section-label">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Everything Arka holds about you, as a JSON file — your account,
          projects, credit history and payments.
        </p>
        {/* A plain link, not fetch(): the response is a download, and letting
            the browser handle it avoids buffering the whole export in memory. */}
        <Button
          variant="outline"
          size="sm"
          // A real <a download>, not a fetch: the browser streams the file to
          // disk instead of the page buffering the whole export in memory.
          // Not next/link either — this is a download, not a route.
          nativeButton={false}
          render={<a href="/api/account/export" download />}
        >
          <Download className="size-4" />
          Download my data
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="section-label text-destructive">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Permanent. Every render, still and project is deleted from storage and
          cannot be recovered. Unused credits are forfeited.
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Records of payments are kept even after deletion, because Indian tax
            law requires it. They no longer identify you.
          </span>
        </p>

        <div className="space-y-2 pt-1">
          <Label htmlFor="confirm-email">
            Type <span className="font-medium text-foreground">{email}</span> to
            confirm
          </Label>
          <Input
            id="confirm-email"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={email}
            autoComplete="off"
          />
        </div>

        <Button
          variant="destructive"
          size="sm"
          disabled={!matches || busy !== null}
          onClick={onDelete}
        >
          {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : null}
          Delete my account permanently
        </Button>
      </section>
    </div>
  );
}
