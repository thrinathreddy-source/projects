"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UserRowActions({
  user,
}: {
  user: { id: string; email: string; banned: boolean; credits: number };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  async function onAdjustCredits(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      toast.error("Enter a whole number, positive or negative.");
      return;
    }

    setPending(true);
    try {
      await api.post(`/api/admin/users/${user.id}`, {
        action: "credits",
        delta: parsed,
        note: note.trim() || "Admin adjustment",
      });
      toast.success(
        `${parsed > 0 ? "Granted" : "Deducted"} ${Math.abs(parsed)} credits.`,
      );
      setCreditsOpen(false);
      setDelta("");
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  async function onToggleBan(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api.post(`/api/admin/users/${user.id}`, {
        action: "ban",
        banned: !user.banned,
        reason: reason.trim() || undefined,
      });
      toast.success(user.banned ? "User reinstated." : "User suspended.");
      setBanOpen(false);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="User actions" />}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCreditsOpen(true)}>
            Adjust credits
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setBanOpen(true)}>
            {user.banned ? "Reinstate account" : "Suspend account"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creditsOpen} onOpenChange={setCreditsOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onAdjustCredits}>
            <DialogHeader>
              <DialogTitle>Adjust credits</DialogTitle>
              <DialogDescription>
                {user.email} currently has {user.credits} credits. Use a negative
                number to take credits away; the balance will not go below zero.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="delta">Change</Label>
                <Input
                  id="delta"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  placeholder="100 or -50"
                  inputMode="numeric"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">Reason</Label>
                <Input
                  id="note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Refund for failed batch"
                  maxLength={200}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onToggleBan}>
            <DialogHeader>
              <DialogTitle>
                {user.banned ? "Reinstate" : "Suspend"} {user.email}?
              </DialogTitle>
              <DialogDescription>
                {user.banned
                  ? "They will be able to sign in and generate again."
                  : "They will be signed out everywhere and blocked from signing in. Their credits and projects are left untouched."}
              </DialogDescription>
            </DialogHeader>

            {!user.banned ? (
              <div className="space-y-2 py-4">
                <Label htmlFor="reason">Reason shown to them</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Repeated terms violations"
                  maxLength={200}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {user.banned ? "Reinstate" : "Suspend"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
