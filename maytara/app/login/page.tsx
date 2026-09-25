"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) { setError("Wrong email or password."); return; }
      router.push("/dashboard");
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
          <Link href="/register" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
            New here? Create account →
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="card p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>
            <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>WELCOME BACK</h1>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Log in to see your match status.</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>EMAIL</label>
              <input type="email" className="input-maytara" placeholder="your@email.com" required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>PASSWORD</label>
              <input type="password" className="input-maytara" placeholder="Your password" required
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {error && (
              <div className="p-3 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                ◆ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2"
              style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? "Logging in..." : "◆ Log In"}
            </button>

            <Link href="/forgot-password" className="text-xs font-typewriter text-center mt-1"
              style={{ color: "var(--ink-muted)" }}>
              Forgot your password?
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
