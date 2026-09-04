"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Link not valid</h1>
          <p className="text-sm text-muted-foreground">
            This reset link is missing or has already been used.
          </p>
        </div>
        <Button className="w-full" render={<Link href="/forgot-password" />}>
          Request a new link
        </Button>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }

    setPending(true);
    const result = await authClient.resetPassword({ newPassword: password, token: token! });
    setPending(false);

    if (result.error) {
      setError(
        result.error.message ??
          "That link has expired. Request a new one and try again.",
      );
      return;
    }

    toast.success("Password updated. Sign in with your new one.");
    router.push("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-sm text-muted-foreground">
          Pick something you have not used elsewhere.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            disabled={pending}
          />
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update password
        </Button>
      </form>
    </div>
  );
}
