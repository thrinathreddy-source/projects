"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately ignored: the confirmation is identical either way, so a
      // network error must not hint at whether the address exists.
    } finally {
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <Link href="/login" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
            ← Back to log in
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="card p-8 w-full max-w-sm">
          {sent ? (
            <div className="text-center">
              <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>
              <h1 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>CHECK YOUR EMAIL</h1>
              <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
                It works once and expires in an hour.
              </p>
              <Link href="/login" className="btn-secondary text-sm">← Back to log in</Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>
                <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>FORGOT PASSWORD</h1>
                <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  We&apos;ll send you a link to set a new one.
                </p>
              </div>

              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>EMAIL</label>
                  <input type="email" className="input-maytara" placeholder="your@email.com" required
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? "Sending…" : "◆ Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
