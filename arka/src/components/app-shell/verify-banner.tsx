"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Shown until an account's email is confirmed.
 *
 * When a signup grant is configured, verification is what releases it, and
 * naming the number is what makes the step worth taking. With the grant at zero
 * the same banner still earns its place — a confirmed address is the only way
 * back into an account whose password is lost — so the copy drops the promise
 * rather than the prompt.
 */
export function VerifyBanner({ email, credits }: { email: string; credits: number }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setState(error ? "failed" : "sent");
  }

  return (
    <div className="border-b border-vermilion/30 bg-vermilion/5 px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">
            {credits > 0
              ? `Confirm your email to collect ${credits} free credits.`
              : "Confirm your email address."}
          </span>{" "}
          <span className="text-muted-foreground">We sent a link to {email}.</span>
        </p>

        {state === "sent" ? (
          <p className="text-sm text-muted-foreground">Sent — check your inbox.</p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={resend}
            disabled={state === "sending"}
          >
            {state === "sending" ? "Sending…" : state === "failed" ? "Try again" : "Resend"}
          </Button>
        )}
      </div>
    </div>
  );
}
