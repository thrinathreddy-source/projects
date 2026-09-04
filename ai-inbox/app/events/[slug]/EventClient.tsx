"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ShareBar } from "@/components/ui/ShareBar";
import { SITE_URL } from "@/lib/siteUrl";

/** Per-event RSVP slot in localStorage. */
const rsvpKey = (slug: string) => `oppidx-event-rsvp-${slug}`;

interface EventDetail {
  slug: string;
  title: string;
  description: string;
  category: string;
  location: string;
  event_time: string;
  host_name: string;
  rsvpCount: number;
  waitlistCount: number;
  capacity: number | null;
  isFull: boolean;
  is_cancelled: boolean;
}

interface StoredRsvp { checkinCode: string; name: string; waitlisted: boolean }

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}

async function shareEventCard(params: Record<string, string>, filename: string, text: string) {
  const url = "/api/events/card?" + new URLSearchParams(params).toString();
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text });
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // user can still screenshot the confirmation card as a fallback
  }
}

export default function EventClient() {
  const params = useParams();
  const slug = String(params.slug);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rsvping, setRsvping] = useState(false);
  const [rsvpError, setRsvpError] = useState("");
  const [rsvp, setRsvp] = useState<StoredRsvp | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(rsvpKey(slug));
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reportSending, setReportSending] = useState(false);

  async function submitReport() {
    setReportSending(true);
    try {
      const res = await fetch("/api/events/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason: reportReason }),
      });
      if (res.ok) { setReportSent(true); setReportOpen(false); }
    } finally {
      setReportSending(false);
    }
  }

  function loadEvent() {
    fetch(`/api/events/${slug}`)
      .then(r => r.json())
      .then(data => { if (data.error) setLoadError(data.error); else setEvent(data.event); })
      .catch(() => setLoadError("Couldn't load this event."));
  }

  useEffect(loadEvent, [slug]);

  useEffect(() => {
    if (!rsvp || rsvp.waitlisted) return;
    QRCode.toDataURL(`${slug}:${rsvp.checkinCode}`, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [rsvp, slug]);

  async function submitRsvp(e: React.FormEvent) {
    e.preventDefault();
    setRsvpError("");
    setRsvping(true);
    try {
      const res = await fetch("/api/events/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, contact }),
      });
      const data = await res.json();
      if (!res.ok) { setRsvpError(data.error || "Couldn't RSVP."); return; }
      const stored = { checkinCode: data.checkinCode, name, waitlisted: Boolean(data.waitlisted) };
      localStorage.setItem(rsvpKey(slug), JSON.stringify(stored));
      setRsvp(stored);
      loadEvent();
    } catch {
      setRsvpError("Something went wrong. Please try again.");
    } finally {
      setRsvping(false);
    }
  }

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <Link href="/resources" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>← All gatherings</Link>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-10 relative z-10">
        {loadError && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--maroon)" }}>◆ {loadError}</p>
          </div>
        )}

        {!event && !loadError && (
          <div className="font-typewriter text-center animate-pulse" style={{ color: "var(--saffron)" }}>◆ Loading...</div>
        )}

        {event && (
          <>
            {event.is_cancelled && (
              <div className="p-4 mb-4 font-typewriter text-sm text-center" style={{ background: "var(--maroon)", color: "var(--btn-text)" }}>
                ⚑ THIS EVENT WAS CANCELLED BY THE HOST
              </div>
            )}

            <div className="card p-7 mb-6" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <span className="text-xs font-typewriter px-2 py-0.5" style={{ background: "var(--bg-dark)", color: "var(--saffron)" }}>
                {event.category.toUpperCase()}
              </span>
              <h1 className="font-typewriter text-3xl mt-3 mb-2" style={{ color: "var(--ink)" }}>{event.title}</h1>
              <p className="text-sm mb-1" style={{ color: "var(--ink)" }}>{formatWhen(event.event_time)}</p>
              <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>
                {event.location} · hosted by {event.host_name} · {event.rsvpCount}{event.capacity ? ` / ${event.capacity}` : ""} going
                {event.waitlistCount > 0 ? ` · ${event.waitlistCount} waitlisted` : ""}
              </p>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--ink-muted)" }}>{event.description}</p>
              <a href={`/api/events/${slug}/ics`} className="text-xs font-typewriter" style={{ color: "var(--saffron)", textDecoration: "underline" }}>
                ⬇ Add to calendar
              </a>
              <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="text-xs font-typewriter tracking-widest mb-2" style={{ color: "var(--ink-muted)" }}>
                  KNOW SOMEONE WHO&apos;D COME?
                </div>
                <ShareBar title={event.title} url={`${SITE_URL}/events/${slug}`} />
              </div>
            </div>

            {event.is_cancelled ? null : rsvp ? (
              <div className="card p-8 text-center" style={{ borderColor: rsvp.waitlisted ? "var(--border)" : "var(--green)", boxShadow: `5px 5px 0 ${rsvp.waitlisted ? "var(--border)" : "var(--green)"}` }}>
                {rsvp.waitlisted ? (
                  <>
                    <div className="font-typewriter text-lg mb-1" style={{ color: "var(--ink)" }}>◈ YOU&apos;RE ON THE WAITLIST, {rsvp.name.toUpperCase()}.</div>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>The event is at capacity. If a spot opens, the host will reach out.</p>
                  </>
                ) : (
                  <>
                    <div className="font-typewriter text-lg mb-1" style={{ color: "var(--green)" }}>✓ YOU&apos;RE IN, {rsvp.name.toUpperCase()}.</div>
                    <p className="text-xs mb-5" style={{ color: "var(--ink-muted)" }}>Show this at the door — it&apos;s your check-in code.</p>
                    {qrDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrDataUrl} alt="Check-in QR code" width={220} height={220} className="mx-auto mb-4" style={{ border: "2px solid var(--border)" }} />
                    )}
                    <div className="font-typewriter text-2xl tracking-widest mb-5" style={{ color: "var(--saffron)" }}>{rsvp.checkinCode}</div>
                    <button
                      onClick={() => shareEventCard(
                        {
                          slug,
                          title: event.title,
                          location: event.location,
                          when: event.event_time,
                          name: rsvp.name,
                        },
                        "oppidx-im-going.png",
                        `I'm going to ${event.title} — oppidx.com/events/${slug}`
                      )}
                      className="btn-primary"
                    >
                      ◆ Share &quot;I&apos;m Going&quot;
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="card p-7">
                <h2 className="font-typewriter text-lg mb-4" style={{ color: "var(--ink)" }}>
                  ◆ RSVP {event.isFull && <span className="text-xs" style={{ color: "var(--maroon)" }}>— FULL, JOIN WAITLIST</span>}
                </h2>
                <form onSubmit={submitRsvp} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR NAME</label>
                    <input type="text" className="input-stamped" required value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>PHONE OR WHATSAPP</label>
                    <input type="text" className="input-stamped" required value={contact} onChange={e => setContact(e.target.value)} />
                  </div>
                  {rsvpError && (
                    <div className="p-3 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                      ◆ {rsvpError}
                    </div>
                  )}
                  <button type="submit" disabled={rsvping} className="btn-primary w-full py-3" style={{ opacity: rsvping ? 0.6 : 1 }}>
                    {rsvping ? "◆ Saving..." : event.isFull ? "◆ Join Waitlist" : "◆ I'm Going"}
                  </button>
                </form>
              </div>
            )}

            <div className="mt-6 pt-5 text-center" style={{ borderTop: "1px solid var(--border)" }}>
              {reportSent ? (
                <p className="text-xs font-typewriter" style={{ color: "var(--maroon)" }}>✓ Report received. Our team will review it.</p>
              ) : !reportOpen ? (
                <button onClick={() => setReportOpen(true)} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
                  ⚑ Report this event — unsafe, unlawful, or misleading
                </button>
              ) : (
                <div className="text-left">
                  <textarea className="input-stamped resize-none mb-3" rows={3}
                    placeholder="What's wrong with this event? (optional, but helps our review)"
                    value={reportReason} onChange={e => setReportReason(e.target.value)} />
                  <div className="flex gap-3">
                    <button onClick={submitReport} disabled={reportSending}
                      className="btn-secondary text-xs px-4 py-2" style={{ borderColor: "var(--maroon)", color: "var(--maroon)", opacity: reportSending ? 0.6 : 1 }}>
                      {reportSending ? "Submitting..." : "⚑ Submit Report"}
                    </button>
                    <button onClick={() => setReportOpen(false)} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
