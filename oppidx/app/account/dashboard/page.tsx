"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/platform/supabase";
import { useNextFriday } from "@/lib/platform/useNextFriday";

interface Notification {
  id: string;
  type: "match" | "no_match";
  title: string;
  body: string;
  contact_revealed?: string;
  contact_type?: string;
  match_name?: string;
  read: boolean;
  created_at: string;
}

interface Profile {
  looking_for: string;
  matched: boolean;
  created_at: string;
}

interface UserData {
  name: string;
  looking_for: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSent, setReportSent] = useState<string | null>(null);
  const [reportSending, setReportSending] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/account"); return; }

      const uid = session.user.id;

      // Fetch user record
      const { data: userData } = await supabase
        .from("users")
        .select("name, looking_for")
        .eq("id", uid)
        .single();

      if (!userData) { router.push("/match/interview"); return; }
      setUser(userData);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("looking_for, matched, created_at")
        .eq("user_id", uid)
        .single();
      setProfile(profileData);

      // Fetch notifications
      const { data: notifData } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      setNotifications(notifData || []);

      // Mark all as read
      if (notifData?.some(n => !n.read)) {
        await supabase.from("notifications").update({ read: true }).eq("user_id", uid);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function sendFeedback(notifId: string, liked: boolean) {
    await fetch("/api/match/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifId, liked }),
    });
    setFeedbackSent(notifId);
  }

  async function submitReport(notifId: string) {
    setReportSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/match/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ notifId, reason: reportReason }),
      });
      if (res.ok) { setReportSent(notifId); setReportOpen(false); }
    } finally {
      setReportSending(false);
    }
  }

  const latestMatch = notifications.find(n => n.type === "match");
  const unreadCount = notifications.filter(n => !n.read).length;
  const countdown = useNextFriday();

  if (loading) {
    return (
      <div className="stamped-scope min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="font-typewriter text-lg animate-pulse" style={{ color: "var(--saffron)" }}>
          ◆ Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-typewriter" style={{ color: "var(--ink-muted)" }}>
              {user?.name}
            </span>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 font-typewriter"
                style={{ background: "var(--saffron)", color: "var(--btn-text)" }}>
                {unreadCount} NEW
              </span>
            )}
            <button onClick={logout} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10 relative z-10 flex flex-col gap-6">

        {/* Status card */}
        <div className="card p-6 flex items-center gap-4"
          style={{
            borderColor: latestMatch ? "var(--saffron)" : "var(--border)",
            boxShadow: latestMatch ? "5px 5px 0 var(--saffron)" : "5px 5px 0 var(--border)",
          }}>
          <div className="text-4xl" style={{ color: "var(--saffron)" }}>
            {latestMatch ? "◆" : profile ? "✦" : "◈"}
          </div>
          <div>
            <div className="font-typewriter text-xs tracking-widest mb-1" style={{ color: "var(--ink-muted)" }}>
              STATUS
            </div>
            <div className="font-typewriter text-lg" style={{ color: "var(--ink)" }}>
              {latestMatch
                ? `Matched with ${latestMatch.match_name}`
                : profile
                ? "In the pool — match runs every Friday"
                : "Profile incomplete — finish your interview"}
            </div>
            {profile && !latestMatch && (
              <div className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                Looking for: {profile.looking_for} · Profile added {new Date(profile.created_at).toLocaleDateString("en-IN")}
              </div>
            )}
          </div>
        </div>

        {/* Countdown — show when in pool but not yet matched */}
        {profile && !latestMatch && (
          <div className="card p-5" style={{ borderColor: "var(--saffron)" }}>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <div className="font-typewriter text-xs tracking-widest mb-1" style={{ color: "var(--ink-muted)" }}>NEXT MATCH DROPS IN</div>
                <div className="font-typewriter text-3xl" style={{ color: "var(--saffron)" }}>{countdown}</div>
                <div className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                  Profile submitted {new Date(profile.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · Every Friday 8pm IST
                </div>
              </div>
              <div className="text-xs leading-relaxed max-w-xs" style={{ color: "var(--ink-muted)" }}>
                You&apos;re in the pool. Every Friday at 8pm IST, we run the algorithm across everyone looking for the same thing.<br /><br />
                <span style={{ color: "var(--saffron)" }}>
                  ◆ Come back here Friday evening. Your result will be on this page — even if the email doesn&apos;t reach you.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Active match reveal */}
        {latestMatch && (
          <div className="card p-8" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
            <div className="font-typewriter text-xs tracking-widest mb-2" style={{ color: "var(--saffron)" }}>
              ◆ YOUR MATCH
            </div>
            <h2 className="font-typewriter text-3xl mb-4" style={{ color: "var(--ink)" }}>
              {latestMatch.match_name}
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink-muted)" }}>
              {latestMatch.body.split("\n\n")[0]}
            </p>
            {latestMatch.contact_revealed && (
              <div className="p-4 mb-6"
                style={{ background: "var(--saffron)", border: "2px solid var(--maroon)" }}>
                <div className="font-typewriter text-xs tracking-widest mb-1" style={{ color: "var(--btn-text)", opacity: 0.8 }}>
                  THEIR {(latestMatch.contact_type || "contact").toUpperCase()}
                </div>
                <div className="font-typewriter text-2xl" style={{ color: "var(--btn-text)" }}>
                  {latestMatch.contact_revealed}
                </div>
              </div>
            )}
            <p className="text-sm italic mb-6" style={{ color: "var(--ink-muted)" }}>
              The rest is yours. We&apos;re out of the room.
            </p>

            {/* Feedback */}
            {!feedbackSent && (
              <div>
                <div className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--ink-muted)" }}>
                  DID THIS MATCH FEEL RIGHT?
                </div>
                <div className="flex gap-3">
                  <button onClick={() => sendFeedback(latestMatch.id, true)} className="btn-primary text-sm px-5 py-2">
                    ✓ &nbsp;Yes, good match
                  </button>
                  <button onClick={() => sendFeedback(latestMatch.id, false)} className="btn-secondary text-sm px-5 py-2">
                    ✗ &nbsp;Not quite
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--ink-muted)" }}>
                  Your feedback improves the next match. We don&apos;t see your conversation.
                </p>
              </div>
            )}
            {feedbackSent && (
              <p className="text-sm font-typewriter" style={{ color: "var(--green)" }}>
                ✓ Feedback received. We&apos;ll use it for your next match.
              </p>
            )}

            {/* Report */}
            <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
              {reportSent === latestMatch.id ? (
                <p className="text-sm font-typewriter" style={{ color: "var(--maroon)" }}>
                  ✓ Report received. Our team will review it — thank you for telling us.
                </p>
              ) : !reportOpen ? (
                <button onClick={() => setReportOpen(true)} className="text-xs font-typewriter"
                  style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
                  ⚑ Report {latestMatch.match_name} — uncomfortable or unsafe meeting
                </button>
              ) : (
                <div>
                  <div className="font-typewriter text-xs tracking-widest mb-2" style={{ color: "var(--maroon)" }}>
                    ◆ REPORT {latestMatch.match_name?.toUpperCase()}
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--ink-muted)" }}>
                    Tell us what happened. Consent matters — if this match made you uncomfortable or violated your consent in any way, we take it seriously and will review their account.
                  </p>
                  <textarea className="input-stamped resize-none mb-3" rows={3}
                    placeholder="What happened? (optional, but helps us review faster)"
                    value={reportReason} onChange={e => setReportReason(e.target.value)} />
                  <div className="flex gap-3">
                    <button onClick={() => submitReport(latestMatch.id)} disabled={reportSending}
                      className="btn-secondary text-xs px-4 py-2" style={{ borderColor: "var(--maroon)", color: "var(--maroon)", opacity: reportSending ? 0.6 : 1 }}>
                      {reportSending ? "Submitting..." : "⚑ Submit Report"}
                    </button>
                    <button onClick={() => setReportOpen(false)} className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No profile yet */}
        {!profile && (
          <div className="card p-6 text-center">
            <div className="text-3xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
            <h3 className="font-typewriter text-lg mb-2" style={{ color: "var(--ink)" }}>
              FINISH YOUR INTERVIEW
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--ink-muted)" }}>
              Your profile isn&apos;t in the pool yet. Complete the 5-question interview to get your first Friday match.
            </p>
            <Link href={`/match/interview?type=${encodeURIComponent(user?.looking_for || "")}`} className="btn-primary">
              ◆ &nbsp; Start Interview
            </Link>
          </div>
        )}

        {/* Past notifications */}
        {notifications.length > 0 && (
          <div>
            <div className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--ink-muted)" }}>
              ◆ HISTORY
            </div>
            <div className="flex flex-col gap-3">
              {notifications.map((n) => (
                <div key={n.id} className="card p-4 flex gap-3 items-start">
                  <span className="text-lg flex-shrink-0 mt-0.5"
                    style={{ color: n.type === "match" ? "var(--saffron)" : "var(--ink-muted)" }}>
                    {n.type === "match" ? "◆" : "◈"}
                  </span>
                  <div>
                    <div className="font-typewriter text-sm mb-1" style={{ color: "var(--ink)" }}>{n.title}</div>
                    <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                      {new Date(n.created_at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <Link href="/match/compatibility" className="card p-5 text-center hover:opacity-80 transition-opacity" style={{ textDecoration: "none", borderColor: "var(--saffron)" }}>
          <div className="text-2xl mb-2" style={{ color: "var(--saffron)" }}>✦</div>
          <div className="font-typewriter text-sm" style={{ color: "var(--saffron)" }}>CHECK COMPATIBILITY</div>
          <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>Run an honest report on any two people — or see how you fit the pool</p>
        </Link>
      </div>
    </div>
  );
}
