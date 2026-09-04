"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

const CATEGORIES = ["Party", "Meetup", "Workshop", "Talk", "Gathering", "Sport", "Other"];

interface Guest {
  id: string;
  name: string;
  checkin_code: string;
  checked_in: boolean;
  checked_in_at: string | null;
  waitlisted: boolean;
  created_at: string;
}

interface ManagedEvent {
  slug: string; title: string; description: string; category: string;
  location: string; event_time: string; host_name: string;
  capacity: number | null; is_cancelled: boolean; is_listed: boolean;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function ManageInner() {
  const params = useParams();
  const search = useSearchParams();
  const slug = String(params.slug);
  const token = search.get("token") || "";

  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [checkinMsg, setCheckinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ title: string; description: string; location: string; category: string; eventTime: string; capacity: string; isListed: boolean } | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function load() {
    fetch(`/api/events/manage?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setEvent(data.event);
        setGuests(data.guests);
      })
      .catch(() => setError("Couldn't load your event."));
  }

  useEffect(load, [slug, token]);

  function startEdit() {
    if (!event) return;
    setEditForm({
      title: event.title, description: event.description, location: event.location,
      category: event.category, eventTime: toDatetimeLocal(event.event_time),
      capacity: event.capacity !== null ? String(event.capacity) : "",
      isListed: event.is_listed,
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setEditError("");
    setEditSaving(true);
    try {
      const res = await fetch("/api/events/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, token, ...editForm,
          eventTime: editForm.eventTime ? new Date(editForm.eventTime).toISOString() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Couldn't save changes."); return; }
      setEditing(false);
      load();
    } catch {
      setEditError("Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  }

  async function cancelEvent() {
    if (!confirm("Cancel this event? Guests will see it marked cancelled. This can't be undone.")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/events/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, token }),
      });
      if (res.ok) load();
    } finally {
      setCancelling(false);
    }
  }

  async function checkIn(e: React.FormEvent) {
    e.preventDefault();
    setCheckinMsg(null);
    try {
      const res = await fetch("/api/events/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, token, code }),
      });
      const data = await res.json();
      if (!res.ok) { setCheckinMsg({ ok: false, text: data.error || "Couldn't check in." }); return; }
      setCheckinMsg({ ok: true, text: data.alreadyCheckedIn ? `${data.name} was already checked in.` : `✓ ${data.name} checked in.` });
      setCode("");
      load();
    } catch {
      setCheckinMsg({ ok: false, text: "Something went wrong." });
    }
  }

  const going = guests.filter(g => !g.waitlisted);
  const waitlisted = guests.filter(g => g.waitlisted);
  const checkedInCount = going.filter(g => g.checked_in).length;

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          {event && <Link href={`/events/${slug}`} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>View public page →</Link>}
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-10 relative z-10">
        {error && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--maroon)" }}>◆ {error}</p>
          </div>
        )}

        {!event && !error && (
          <div className="font-typewriter text-center animate-pulse" style={{ color: "var(--saffron)" }}>◆ Loading...</div>
        )}

        {event && !editing && (
          <>
            {event.is_cancelled && (
              <div className="p-4 mb-4 font-typewriter text-sm text-center" style={{ background: "var(--maroon)", color: "var(--btn-text)" }}>
                ⚑ YOU CANCELLED THIS EVENT
              </div>
            )}

            <div className="card p-6 mb-6" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="font-typewriter text-xs tracking-widest mb-1" style={{ color: "var(--saffron)" }}>◆ HOST VIEW</div>
              <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>{event.title}</h1>
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{formatWhen(event.event_time)} · {event.location}</p>
              <p className="text-sm font-typewriter mt-3" style={{ color: "var(--ink)" }}>
                {checkedInCount} / {going.length}{event.capacity ? ` (cap ${event.capacity})` : ""} checked in
                {waitlisted.length > 0 ? ` · ${waitlisted.length} waitlisted` : ""}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                {event.is_listed ? "◈ Public — listed on Resources for anyone to discover" : "◈ Unlisted — findable by direct link only"}
              </p>
              {!event.is_cancelled && (
                <div className="flex gap-3 mt-4">
                  <button onClick={startEdit} className="btn-secondary text-xs px-4 py-2">✎ Edit Event</button>
                  <button onClick={cancelEvent} disabled={cancelling} className="text-xs font-typewriter" style={{ color: "var(--maroon)", textDecoration: "underline", opacity: cancelling ? 0.6 : 1 }}>
                    {cancelling ? "Cancelling..." : "Cancel Event"}
                  </button>
                </div>
              )}
            </div>

            {!event.is_cancelled && (
              <div className="card p-6 mb-6">
                <h3 className="font-typewriter text-sm tracking-widest mb-3" style={{ color: "var(--ink)" }}>◆ CHECK IN A GUEST</h3>
                <form onSubmit={checkIn} className="flex gap-3">
                  <input type="text" className="input-stamped" placeholder="8-character code from their screen"
                    value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={{ flex: 1 }} />
                  <button type="submit" className="btn-primary px-5" disabled={!code.trim()}>Check In</button>
                </form>
                {checkinMsg && (
                  <p className="text-sm font-typewriter mt-3" style={{ color: checkinMsg.ok ? "var(--green)" : "var(--maroon)" }}>
                    {checkinMsg.text}
                  </p>
                )}
              </div>
            )}

            <div className="mb-6">
              <div className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--ink-muted)" }}>◆ GUEST LIST</div>
              <div className="flex flex-col gap-2">
                {going.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No RSVPs yet. Share the event link to get people in.</p>
                )}
                {going.map(g => (
                  <div key={g.id} className="card p-4 flex items-center justify-between">
                    <div>
                      <div className="font-typewriter text-sm" style={{ color: "var(--ink)" }}>{g.name}</div>
                      <div className="text-xs" style={{ color: "var(--ink-muted)" }}>code: {g.checkin_code}</div>
                    </div>
                    <span className="text-xs font-typewriter px-2 py-1"
                      style={{ background: g.checked_in ? "var(--green)" : "var(--bg-dark)", color: g.checked_in ? "var(--btn-text)" : "var(--ink-muted)" }}>
                      {g.checked_in ? "✓ CHECKED IN" : "NOT YET"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {waitlisted.length > 0 && (
              <div>
                <div className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--ink-muted)" }}>◈ WAITLIST</div>
                <div className="flex flex-col gap-2">
                  {waitlisted.map(g => (
                    <div key={g.id} className="card p-4" style={{ borderColor: "var(--border)" }}>
                      <div className="font-typewriter text-sm" style={{ color: "var(--ink)" }}>{g.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {event && editing && editForm && (
          <div className="card p-7">
            <h2 className="font-typewriter text-lg mb-4" style={{ color: "var(--ink)" }}>◆ EDIT EVENT</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>TITLE</label>
                <input type="text" className="input-stamped" required value={editForm.title}
                  onChange={e => setEditForm(f => f && { ...f, title: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CATEGORY</label>
                <select className="select-stamped" value={editForm.category}
                  onChange={e => setEditForm(f => f && { ...f, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>DESCRIPTION</label>
                <textarea className="input-stamped resize-none" rows={3} required value={editForm.description}
                  onChange={e => setEditForm(f => f && { ...f, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>LOCATION</label>
                  <input type="text" className="input-stamped" required value={editForm.location}
                    onChange={e => setEditForm(f => f && { ...f, location: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>WHEN</label>
                  <input type="datetime-local" className="input-stamped" required value={editForm.eventTime}
                    onChange={e => setEditForm(f => f && { ...f, eventTime: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CAPACITY <span style={{ opacity: 0.7 }}>(optional)</span></label>
                <input type="number" min={1} max={100000} className="input-stamped" placeholder="Leave blank for unlimited"
                  value={editForm.capacity} onChange={e => setEditForm(f => f && { ...f, capacity: e.target.value })} />
              </div>
              <label className="flex items-start gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                <input type="checkbox" checked={editForm.isListed} className="mt-0.5"
                  onChange={e => setEditForm(f => f && { ...f, isListed: e.target.checked })} />
                <span>List this event publicly on Resources so anyone can discover it.</span>
              </label>
              {editError && (
                <div className="p-3 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                  ◆ {editError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" disabled={editSaving} className="btn-primary px-6 py-2" style={{ opacity: editSaving ? 0.6 : 1 }}>
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManageEventPage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--bg)", minHeight: "100vh" }} />}>
      <ManageInner />
    </Suspense>
  );
}
