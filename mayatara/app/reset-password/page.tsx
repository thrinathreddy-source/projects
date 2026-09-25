"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase returns the recovery tokens in the URL fragment. The client picks
  // them up and emits PASSWORD_RECOVERY specifically — that's the only event
  // that proves this session came from a reset link, so it's the only one we
  // trust here. A pre-existing logged-in session (e.g. left open on a shared
  // computer) must NOT be treated as a valid recovery session, or anyone with
  // access to that browser could reset the owner's password without the link.
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setValid(true);
        setReady(true);
      }
    });

    // If the recovery event hasn't arrived shortly, treat the link as expired
    // rather than spinning on "Checking your link…" forever.
    const timeout = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 3000);

    return () => { cancelled = true; clearTimeout(timeout); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) { setError(updErr.message || "Could not update the password."); return; }
      // Don't leave the recovery session open behind them.
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <Link href="/login" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>← Back to log in</Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="card p-8 w-full max-w-sm text-center">
          <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>

          {!ready ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Checking your link…</p>
          ) : done ? (
            <>
              <h1 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>PASSWORD CHANGED</h1>
              <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
                Taking you to the log in page…
              </p>
              <Link href="/login" className="btn-secondary text-sm">Log in now</Link>
            </>
          ) : !valid ? (
            <>
              <h1 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>LINK EXPIRED</h1>
              <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
                Reset links work once and last an hour. Ask for a fresh one.
              </p>
              <Link href="/forgot-password" className="btn-primary text-sm">◆ Send a new link</Link>
            </>
          ) : (
            <>
              <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>SET A NEW PASSWORD</h1>
              <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>At least 10 characters.</p>

              <form onSubmit={submit} className="flex flex-col gap-4 text-left">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>NEW PASSWORD</label>
                  <input type="password" className="input-maytara" required autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CONFIRM</label>
                  <input type="password" className="input-maytara" required autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                {error && <p className="text-xs" style={{ color: "var(--maroon)" }}>{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? "Saving…" : "◆ Save new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
