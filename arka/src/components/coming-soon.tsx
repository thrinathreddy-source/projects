"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { api, messageFor } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dharmachakra } from "@/components/motifs";

/**
 * The holding page.
 *
 * One job: take an address. Traffic that arrives before launch and leaves
 * nothing behind is traffic spent for nothing, and this is the cheapest thing
 * that turns it into an audience.
 *
 * Same press vocabulary as the landing page — poster type, the wheel, the four
 * inks — because a holding page that looks like a different company than the
 * one that eventually opens has wasted the impression it just bought.
 */
export function ComingSoon({ promise }: { promise: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState("sending");
    try {
      await api.post("/api/waitlist", { email: email.trim() });
      setState("done");
    } catch (error) {
      setState("idle");
      // Inline rather than a toast: the form is the only thing on the page.
      setError(messageFor(error));
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-20">
      {/* The sun, which is what "arka" means. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-15%] size-[36rem] rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative w-full max-w-xl space-y-10">
        <div className="flex items-center gap-3">
          <Dharmachakra className="size-9 text-primary" />
          <span className="poster text-3xl tracking-[0.2em]">Arka</span>
        </div>

        <div className="space-y-5">
          <h1 className="poster text-6xl leading-[0.85] sm:text-7xl">
            Indian stories,
            <br />
            <span className="text-primary">drawn like anime.</span>
          </h1>

          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            One line of text becomes a short anime film. Twelve Indian
            languages, vertical by default, priced in rupees.
          </p>

          <p className="annotation text-saffron">{promise}</p>
        </div>

        {state === "done" ? (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
            <Check className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="space-y-1">
              <p className="text-sm font-medium">You are on the list.</p>
              <p className="text-sm text-muted-foreground">
                We will write once — when it opens. Nothing else.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-12 flex-1 text-base"
                disabled={state === "sending"}
              />
              <Button type="submit" size="lg" className="h-12" disabled={state === "sending"}>
                {state === "sending" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                Tell me when it opens
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {/* Said plainly and kept true, because the full privacy policy is
                still being finished and an address is being collected now. */}
            <p className="text-xs text-muted-foreground">
              We store your address to email you once, at launch, and for
              nothing else. Reply to that email and it is deleted.
            </p>
          </form>
        )}

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/acceptable-use" className="hover:text-foreground">Acceptable use</a>
          <a href="/grievance" className="hover:text-foreground">Report a problem</a>
          <a href="/contact" className="hover:text-foreground">Contact</a>
        </footer>
      </div>
    </main>
  );
}
