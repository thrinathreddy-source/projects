"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { identify, track } from "@/components/analytics-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Mode = "sign-in" | "sign-up";

const COPY = {
  "sign-in": {
    heading: "Welcome back",
    sub: "Sign in to keep making.",
    submit: "Sign in",
    switchText: "New to Arka?",
    switchCta: "Create an account",
    switchHref: "/sign-up",
  },
  "sign-up": {
    heading: "Create your account",
    sub: "Takes a minute. Add credits whenever you are ready.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchCta: "Sign in",
    switchHref: "/sign-in",
  },
} as const;

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const copy = COPY[mode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [pending, startTransition] = useTransition();
  const [googlePending, setGooglePending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email, password })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Try again.");
      return;
    }

    if (result.data?.user) {
      identify(result.data.user.id, { email: result.data.user.email });
      track(mode === "sign-up" ? "user_signed_up" : "user_signed_in");
    }

    startTransition(() => {
      router.push(nextUrl);
      router.refresh();
    });
  }

  async function onGoogle() {
    setError(null);
    setGooglePending(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: nextUrl,
    });
    if (result.error) {
      setError(result.error.message ?? "Could not sign in with Google.");
      setGooglePending(false);
    }
  }

  const busy = pending || googlePending;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="page-title text-3xl">{copy.heading}</h1>
        <p className="text-sm text-muted-foreground">{copy.sub}</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {googleEnabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onGoogle}
            disabled={busy}
          >
            {googlePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleGlyph />
            )}
            Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "sign-up" ? (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Priya Sharma"
              autoComplete="name"
              required
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            {mode === "sign-in" ? (
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot?
              </Link>
            ) : null}
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "sign-up" ? "At least 8 characters" : "••••••••"}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            minLength={8}
            required
            disabled={busy}
          />
        </div>

        {/**
          * Explicit, and unticked by default.
          *
          * The DPDP Act asks for consent that is freely given and unambiguous,
          * and a sentence under the button saying "by continuing you agree"
          * asks nobody for anything. This is also the record: the box was
          * ticked by a person before the account existed.
          */}
        {mode === "sign-up" ? (
          <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              disabled={busy}
              className="mt-0.5 size-4 shrink-0 accent-primary"
              required
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="underline underline-offset-4">
                Terms
              </Link>
              , the{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              and the{" "}
              <Link href="/acceptable-use" className="underline underline-offset-4">
                Acceptable Use Policy
              </Link>
              , and I consent to Arka processing my data as described there.
            </span>
          </label>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={busy || (mode === "sign-up" && !consented)}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {copy.submit}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {copy.switchText}{" "}
        <Link
          href={copy.switchHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {copy.switchCta}
        </Link>
      </p>

    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
