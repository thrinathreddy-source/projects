"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { GRIEVANCE_CATEGORIES, GRIEVANCE_OFFICER } from "@/lib/grievance";

// Preselect the category when linked to directly, e.g. /contact?about=delete
// from the terms page, so someone asking for deletion lands on the right form.
const SHORTCUTS: Record<string, string> = {
  abuse:  "Report abuse or a safety concern",
  delete: "Delete my account",
  data:   "Correct or export my data",
  bug:    "Something is broken",
};

// The form reads ?about, so it sits behind a Suspense boundary: this route is
// prerendered, and useSearchParams in a prerendered tree fails the production
// build without one.
export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactForm />
    </Suspense>
  );
}

function ContactForm() {
  const searchParams = useSearchParams();
  const about = searchParams.get("about");

  const [form, setForm] = useState({
    // Read during render rather than set from an effect — an effect would
    // render the empty picker first and then immediately re-render it.
    category: (about && SHORTCUTS[about]) || "",
    name: "", email: "", message: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [token, setToken] = useState<string | null>(null);

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  useEffect(() => {
    // If they're signed in, prefill and pass the session along — a deletion
    // request then arrives already tied to an account.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setToken(session.access_token);
      if (session.user.email) setForm(f => ({ ...f, email: f.email || session.user.email! }));
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/grievance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setReference(data.reference || "");
    } catch {
      setError("Couldn't reach us just now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const urgent = form.category === "Report abuse or a safety concern";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="font-typewriter text-lg sm:text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <span className="text-xs tracking-widest font-typewriter text-right" style={{ color: "var(--ink-muted)" }}>REPORT &amp; CONTACT</span>
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-12 relative z-10">
        {reference ? (
          <div className="card p-8 text-center">
            <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>
            <h1 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>WE HAVE IT</h1>
            <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>
              Your reference is <strong style={{ color: "var(--ink)" }}>{reference}</strong>. Keep it — quote it if you write again.
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
              A person reads every one of these. Safety reports are acknowledged within 24 hours;
              everything else is answered within 15 days. We&apos;ll reply to the address you gave us.
            </p>
            <Link href="/" className="btn-secondary text-sm">← Back to The Mayatara</Link>
          </div>
        ) : (
          <>
            <div className="text-3xl mb-6 text-center" style={{ color: "var(--saffron)" }}>◆</div>
            <h1 className="font-typewriter text-2xl mb-2 text-center" style={{ color: "var(--ink)" }}>REPORT &amp; CONTACT</h1>
            <p className="text-xs text-center mb-10" style={{ color: "var(--ink-muted)" }}>
              One inbox. A person reads it. No ticket queue, no bot.
            </p>

            <form onSubmit={submit} className="card p-6 sm:p-8 flex flex-col gap-5">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>WHAT IS THIS ABOUT</label>
                <select className="select-maytara" required
                  value={form.category} onChange={e => update("category", e.target.value)}>
                  <option value="">Choose one…</option>
                  {GRIEVANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {urgent && (
                <div className="text-xs leading-relaxed p-4"
                  style={{ border: "2px solid var(--maroon)", color: "var(--ink)", background: "rgba(139,26,26,0.05)" }}>
                  <strong>If you are in immediate danger, call 112 first.</strong><br />
                  Women&apos;s helpline: 181 · Cyber crime: 1930 or cybercrime.gov.in<br />
                  We act on reports, but we are not an emergency service.
                </div>
              )}

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR NAME <span style={{ opacity: 0.6 }}>(OPTIONAL)</span></label>
                <input type="text" className="input-maytara" maxLength={100}
                  value={form.name} onChange={e => update("name", e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>EMAIL</label>
                <input type="email" className="input-maytara" placeholder="your@email.com" required
                  value={form.email} onChange={e => update("email", e.target.value)} />
                <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>So we can reply. Nothing else.</p>
              </div>

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>WHAT HAPPENED</label>
                <textarea className="input-maytara" rows={7} required maxLength={5000}
                  style={{ fontFamily: "'Courier Prime', monospace", resize: "vertical" }}
                  placeholder="Take as much space as you need."
                  value={form.message} onChange={e => update("message", e.target.value)} />
                <p className="text-xs mt-1 text-right" style={{ color: "var(--ink-muted)" }}>{form.message.length}/5000</p>
              </div>

              {error && (
                <div className="text-sm p-3" style={{ border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "Sending…" : "◆ Send"}
              </button>
            </form>

            <div className="mt-8 p-5 text-xs leading-relaxed"
              style={{ border: "1px solid var(--border)", color: "var(--ink-muted)" }}>
              <div className="font-typewriter tracking-widest mb-2" style={{ color: "var(--saffron)" }}>◆ GRIEVANCE REDRESSAL</div>
              In line with the Information Technology (Intermediary Guidelines and Digital Media
              Ethics Code) Rules, 2021, this form is the grievance channel for The Mayatara.
              {GRIEVANCE_OFFICER ? ` Our designated Grievance Officer is ${GRIEVANCE_OFFICER}.` : ""}
              {" "}Complaints are acknowledged within 24 hours and resolved within 15 days.
              Requests to delete, correct, or export your data are handled here too, and are
              actioned within 15 days of us confirming it&apos;s your account.
              <br /><br />
              <Link href="/terms" style={{ color: "var(--saffron)" }}>Terms &amp; Privacy →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
