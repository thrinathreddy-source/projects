"use client";

import { useState } from "react";
import Link from "next/link";

const CATEGORIES = ["Party", "Meetup", "Workshop", "Talk", "Gathering", "Sport", "Other"];

// <input type="datetime-local"> interprets its value/min as local wall-clock
// time, not UTC — subtracting the timezone offset before slicing (same fix
// already applied in .../[slug]/manage/page.tsx's toDatetimeLocal()) is
// required so the enforced minimum actually matches "one hour from now" in
// the host's own timezone, not UTC.
function minDateTime() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function NewEventPage() {
  const [form, setForm] = useState({
    title: "", description: "", location: "", eventTime: "",
    hostName: "", hostContact: "", category: "Gathering", capacity: "",
  });
  const [isListed, setIsListed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ slug: string; manageToken: string } | null>(null);

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          eventTime: form.eventTime ? new Date(form.eventTime).toISOString() : "",
          isListed,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't create your event."); return; }
      setResult({ slug: data.slug, manageToken: data.manageToken });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const manageUrl = `/events/${result.slug}/manage?token=${result.manageToken}`;
    const publicUrl = `/events/${result.slug}`;
    return (
      <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-16 relative z-10">
          <div className="card p-10 max-w-lg w-full text-center" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
            <div className="text-4xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
            <h2 className="font-typewriter text-2xl mb-4" style={{ color: "var(--ink)" }}>YOUR EVENT IS LIVE.</h2>

            <div className="w-full px-5 py-4 mb-5 font-typewriter text-left" style={{ background: "var(--maroon)", color: "var(--btn-text)", border: "2px solid var(--maroon)" }}>
              <div className="text-xs tracking-widest mb-1 opacity-70">SAVE THIS LINK — IT&apos;S THE ONLY WAY TO MANAGE YOUR EVENT</div>
              <div className="text-xs break-all">{typeof window !== "undefined" ? window.location.origin : ""}{manageUrl}</div>
            </div>

            <p className="text-xs mb-6" style={{ color: "var(--ink-muted)" }}>
              No account, no password — this link is your key. Bookmark it or copy it somewhere safe.
              It&apos;s how you&apos;ll see who&apos;s coming and check people in at the door.
              {!isListed && " Your event is unlisted — only people you share the link with can find it."}
            </p>

            <div className="flex flex-col gap-3">
              <Link href={manageUrl} className="btn-primary w-full py-3 text-center">◆ &nbsp; Go to Guest List</Link>
              <Link href={publicUrl} className="btn-secondary w-full py-3 text-center">✦ &nbsp; View Public Event Page</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <Link href="/resources" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>← All gatherings</Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <div className="card p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>❋</div>
            <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>HOST AN EVENT</h1>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No account needed. Live in seconds.</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>TITLE</label>
              <input type="text" className="input-stamped" placeholder="Rooftop mixer, book club, 5-a-side..." required
                value={form.title} onChange={e => update("title", e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CATEGORY</label>
              <select className="select-stamped" value={form.category} onChange={e => update("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>DESCRIPTION</label>
              <textarea className="input-stamped resize-none" rows={3} placeholder="What's happening, who it's for, what to bring..." required
                value={form.description} onChange={e => update("description", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>LOCATION</label>
                <input type="text" className="input-stamped" placeholder="Koramangala, Bangalore" required
                  value={form.location} onChange={e => update("location", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>WHEN</label>
                <input type="datetime-local" className="input-stamped" required min={minDateTime()}
                  value={form.eventTime} onChange={e => update("eventTime", e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CAPACITY <span style={{ opacity: 0.7 }}>(optional)</span></label>
              <input type="number" min={1} max={100000} className="input-stamped" placeholder="Leave blank for unlimited"
                value={form.capacity} onChange={e => update("capacity", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>RSVPs past this number go to a waitlist automatically.</p>
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                Bigger or public-venue gatherings can need local permits or police permission depending on your city — that&apos;s on you to check, we don&apos;t verify it.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
              <input type="checkbox" checked={isListed} onChange={e => setIsListed(e.target.checked)} className="mt-0.5" />
              <span>
                List this event publicly on <strong>Resources</strong> so anyone can discover it.
                {" "}Off by default — unchecked, only people with the direct link can find or RSVP to it.
              </span>
            </label>

            <div className="gem-divider my-1 text-xs">◆ YOU, THE HOST ◆</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR NAME</label>
                <input type="text" className="input-stamped" placeholder="What guests will see" required
                  value={form.hostName} onChange={e => update("hostName", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR CONTACT</label>
                <input type="text" className="input-stamped" placeholder="Phone or WhatsApp" required
                  value={form.hostContact} onChange={e => update("hostContact", e.target.value)} />
              </div>
            </div>
            <p className="text-xs -mt-2" style={{ color: "var(--ink-muted)" }}>Encrypted, never shown publicly — for our team only if something needs review.</p>

            {error && (
              <div className="p-3 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                ◆ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2"
              style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? "◆ Publishing..." : "◆ Publish Event"}
            </button>

            <p className="text-xs text-center leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              By publishing you agree to our{" "}
              <Link href="/match/terms" style={{ color: "var(--saffron)" }}>Terms & Privacy Policy</Link>,
              including that you&apos;re responsible for your event&apos;s legality and any required permits.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
