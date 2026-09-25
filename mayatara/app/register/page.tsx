"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { supabase } from "@/lib/supabase";
import { readAttribution } from "@/lib/attribution";

const TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];
const GENDERS = ["Male", "Female", "Others"];
const ENERGIES = ["Introvert", "Extrovert", "Ambivert", "No preference"];
const COMM_STYLES = ["Texter", "Caller", "In-person", "No preference"];
const LOCATION_PREFS = ["Same city only", "Anywhere in India", "Open to long distance", "No preference"];
const CONTACT_TYPES = [
  { value: "phone",       label: "Phone number" },
  { value: "whatsapp",    label: "WhatsApp" },
  { value: "instagram",   label: "Instagram handle" },
  { value: "telegram",    label: "Telegram username" },
  { value: "snapchat",    label: "Snapchat username" },
  { value: "twitter",     label: "X / Twitter handle" },
  { value: "linkedin",    label: "LinkedIn profile URL" },
  { value: "email",       label: "Email address" },
  { value: "letterpost",  label: "Letter post (address) 📮" },
];

// Latest date of birth the form will accept. Built from local date parts, not
// toISOString(): that converts to UTC first, so for anyone in IST between
// midnight and 5:30am it returned yesterday's date and moved the cutoff a day
// out of step with the server's own 18+ check.
function maxDOB() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [outsideIndia, setOutsideIndia] = useState(false);

  useEffect(() => {
    // Country check via our own endpoint, which reads the header Vercel sets.
    // An empty country means we couldn't tell (local dev, or the header is
    // missing) — say nothing rather than warn someone off wrongly.
    fetch("/api/geo")
      .then(r => r.json())
      .then(({ country }) => { if (country && country !== "IN") setOutsideIndia(true); })
      .catch(() => { /* fail open — the server still blocks on submit */ });
  }, []);

  const [form, setForm] = useState({
    name: "", email: "", password: "",
    dob: "", gender: "", height: "", city: "",
    religion: "", profession: "", mother_tongue: "",
    institution: "", quirky_fact: "",
    lookingFor: "", contact: "", contactType: "whatsapp",
  });

  const [prefs, setPrefs] = useState({
    pref_gender: "",
    pref_age_min: "",
    pref_age_max: "",
    pref_height_min: "",
    pref_height_max: "",
    pref_religion: "",
    pref_location: "",
    pref_energy: "",
    pref_comm_style: "",
    pref_mother_tongue: "",
    pref_profession: "",
    pref_dealbreaker: "",
    pref_in_one_line: "",
  });

  function updatePref(k: string, v: string) { setPrefs(p => ({ ...p, [k]: v })); }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.lookingFor) { setError("Tell us what you're looking for."); return; }
    if (!form.contact)    { setError("We need a contact for your match."); return; }
    if (!form.dob)        { setError("We need your date of birth."); return; }
    setLoading(true);
    const attribution = readAttribution();
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, email: form.email, password: form.password,
          dob: form.dob, gender: form.gender, height: form.height,
          city: form.city, religion: form.religion, profession: form.profession,
          mother_tongue: form.mother_tongue, institution: form.institution,
          quirky_fact: form.quirky_fact, lookingFor: form.lookingFor,
          attribution,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed."); return; }

      // Conversion event. The channel is also written to the user row server
      // side — this is the real-time view, that one is what you join against
      // later to see which channel produced people who actually finish.
      try {
        track("signup", {
          source:   attribution.source   ?? "unknown",
          medium:   attribution.medium   ?? "unknown",
          campaign: attribution.campaign ?? "none",
          lookingFor: form.lookingFor,
        });
      } catch { /* analytics must never block a signup */ }

      // Account is created server-side (admin API) but that doesn't sign the
      // browser in — do that explicitly so the interview save + dashboard
      // both see an authenticated session right away.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password,
      });
      if (signInError) { setError("Account created, but we couldn't log you in automatically. Please log in."); router.push("/login"); return; }

      // Hand off userId/contact/prefs via sessionStorage rather than the URL —
      // this data (phone numbers, addresses) has no business sitting in browser
      // history or server access logs before it's ever encrypted.
      const filledPrefs = Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== ""));
      try {
        sessionStorage.setItem("mayatara_pending_signup", JSON.stringify({
          userId: data.userId, contact: form.contact, contactType: form.contactType, prefs: filledPrefs,
        }));
      } catch { /* sessionStorage unavailable — interview falls back to the manual-choice screen */ }
      router.push(`/interview?type=${encodeURIComponent(form.lookingFor)}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const contactPlaceholder: Record<string, string> = {
    phone: "+91 98765 43210", whatsapp: "+91 98765 43210",
    instagram: "@yourhandle", telegram: "@yourusername",
    snapchat: "yourusername", twitter: "@yourhandle",
    linkedin: "linkedin.com/in/yourname", email: "you@email.com",
    letterpost: "Flat 3B, 12 MG Road, Bangalore 560001, Karnataka",
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <Link href="/login" className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
            Already have an account? Log in →
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">

        {outsideIndia && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.7)" }}>
            <div className="card p-10 max-w-md w-full text-center"
              style={{ borderColor: "var(--maroon)", boxShadow: "6px 6px 0 var(--maroon)" }}>
              <div className="text-4xl mb-5" style={{ color: "var(--maroon)" }}>◈</div>
              <h2 className="font-typewriter text-xl mb-4" style={{ color: "var(--ink)" }}>
                INDIA ONLY — FOR NOW.
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
                Registration is currently open to people based in India only.
                We&apos;re starting here, doing it right, and expanding when the time is right.
              </p>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink-muted)" }}>
                You can still explore the app, read about us, and check compatibility.
                Join the waiting list and we&apos;ll let you know when we open your region.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link href="/" className="btn-secondary text-sm">← Explore the App</Link>
                <Link href="/compatibility" className="btn-primary text-sm">✦ Try Compatibility Check</Link>
              </div>
            </div>
          </div>
        )}

        <div className="card p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◆</div>
            <h1 className="font-typewriter text-2xl mb-2" style={{ color: "var(--ink)" }}>CREATE YOUR ACCOUNT</h1>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              No Google. No Facebook. Just you.<br />Your data stays yours.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">

            {/* ── ACCOUNT ── */}
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR NAME</label>
              <input type="text" className="input-maytara" placeholder="What do people call you?" required
                value={form.name} onChange={e => update("name", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>EMAIL</label>
              <input type="email" className="input-maytara" placeholder="your@email.com" required
                value={form.email} onChange={e => update("email", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>PASSWORD</label>
              <input type="password" className="input-maytara" placeholder="At least 10 characters" required minLength={10}
                value={form.password} onChange={e => update("password", e.target.value)} />
            </div>

            {/* ── ABOUT YOU ── */}
            <div className="gem-divider my-1 text-xs">◆ ABOUT YOU ◆</div>
            <p className="text-xs -mt-2 mb-1 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              Fill these in only if they matter to you in a match too.<br />
              Leave anything blank that you don&apos;t care about.
            </p>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>DATE OF BIRTH <span style={{ color: "var(--maroon)" }}>*</span></label>
              <input type="date" className="input-maytara" required max={maxDOB()}
                value={form.dob} onChange={e => update("dob", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>Must be 18+. Our algorithm won&apos;t match across gaps of more than 5 years.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>GENDER</label>
                <select className="select-maytara" value={form.gender} onChange={e => update("gender", e.target.value)}>
                  <option value="">— select —</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>HEIGHT</label>
                <input type="text" className="input-maytara" placeholder="5′10″ or 178cm"
                  value={form.height} onChange={e => update("height", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>YOUR CITY <span style={{ color: "var(--maroon)" }}>*</span></label>
                <input type="text" className="input-maytara" placeholder="Bangalore, Mumbai..." required
                  value={form.city} onChange={e => update("city", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>PROFESSION</label>
                <input type="text" className="input-maytara" placeholder="Designer, founder..."
                  value={form.profession} onChange={e => update("profession", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>MOTHER TONGUE</label>
                <input type="text" className="input-maytara" placeholder="Telugu, Tamil..."
                  value={form.mother_tongue} onChange={e => update("mother_tongue", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>RELIGION / FAITH</label>
                <input type="text" className="input-maytara" placeholder="Optional — or 'open'"
                  value={form.religion} onChange={e => update("religion", e.target.value)} />
              </div>
            </div>

            <div className="p-4" style={{ border: "2px solid var(--saffron)", boxShadow: "3px 3px 0 var(--saffron)", background: "var(--card)" }}>
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--saffron)" }}>
                ◆ INSTITUTION / COMPANY <span style={{ opacity: 0.7 }}>(for community matching)</span>
              </label>
              <input type="text" className="input-maytara" placeholder="IIT Bombay, BITS Pilani, Google..."
                value={form.institution} onChange={e => update("institution", e.target.value)} />
              <p className="text-xs mt-2" style={{ color: "var(--ink-muted)" }}>
                Match someone from your own campus or company. You might already know them.
              </p>
            </div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--saffron)" }}>✦ ONE QUIRKY FACT ABOUT YOU</label>
              <input type="text" className="input-maytara" placeholder="I've read the same book 7 times. I can't parallel park. I talk to plants."
                value={form.quirky_fact} onChange={e => update("quirky_fact", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>Shared with your match as an icebreaker.</p>
            </div>

            {/* ── FOR YOUR MATCH ── */}
            <div className="gem-divider my-1 text-xs">◆ HOW SHOULD YOUR MATCH REACH YOU? ◆</div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>CHOOSE YOUR CHANNEL</label>
              <select className="select-maytara mb-2" value={form.contactType} onChange={e => update("contactType", e.target.value)}>
                {CONTACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {form.contactType === "letterpost" && (
                <p className="text-xs mb-2 italic" style={{ color: "var(--saffron)" }}>
                  ✦ Letter post — a dying art. Your match will write to you. Give your full mailing address.
                </p>
              )}
              <textarea className="input-maytara resize-none" rows={form.contactType === "letterpost" ? 3 : 1}
                placeholder={contactPlaceholder[form.contactType] || "Your contact"}
                required value={form.contact} onChange={e => update("contact", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                Encrypted and only ever shared with your confirmed match. Never visible to us.
              </p>
            </div>

            <div className="p-4" style={{ border: "2px solid var(--saffron)", boxShadow: "3px 3px 0 var(--saffron)", background: "var(--card)" }}>
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--saffron)" }}>◆ I&apos;M LOOKING FOR —</label>
              <select className="select-maytara" required value={form.lookingFor} onChange={e => update("lookingFor", e.target.value)}>
                <option value="">— choose —</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {error && (
              <div className="p-3 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>
                ◆ {error}
              </div>
            )}

            {/* ── WHAT YOU WANT IN THEM ── */}
            <div className="gem-divider my-1 text-xs">◆ WHAT YOU WANT IN THEM ◆</div>

            <div>
              <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>IN ONE LINE — DESCRIBE THE PERSON YOU&apos;RE LOOKING FOR</label>
              <input type="text" className="input-maytara"
                placeholder="Someone who reads, argues well, and doesn't take themselves too seriously."
                value={prefs.pref_in_one_line} onChange={e => updatePref("pref_in_one_line", e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>This is the single most important field for AI matching — be honest, not aspirational.</p>
            </div>

            {["Dating", "Wedding", "Still Figuring Out"].includes(form.lookingFor) && (<>
              <p className="text-xs font-typewriter tracking-widest text-center" style={{ color: "var(--ink-muted)" }}>
                ◆ PHYSICAL PREFERENCES — for romantic matching only
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>THEIR GENDER</label>
                  <select className="select-maytara" value={prefs.pref_gender} onChange={e => updatePref("pref_gender", e.target.value)}>
                    <option value="">No preference</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>LOCATION PREFERENCE</label>
                  <select className="select-maytara" value={prefs.pref_location} onChange={e => updatePref("pref_location", e.target.value)}>
                    <option value="">No preference</option>
                    {LOCATION_PREFS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>AGE RANGE — MIN</label>
                  <input type="number" className="input-maytara" placeholder="e.g. 24" min={18} max={80}
                    value={prefs.pref_age_min} onChange={e => updatePref("pref_age_min", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>AGE RANGE — MAX</label>
                  <input type="number" className="input-maytara" placeholder="e.g. 32" min={18} max={80}
                    value={prefs.pref_age_max} onChange={e => updatePref("pref_age_max", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>HEIGHT RANGE — MIN</label>
                  <input type="text" className="input-maytara" placeholder="e.g. 5′4″"
                    value={prefs.pref_height_min} onChange={e => updatePref("pref_height_min", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>HEIGHT RANGE — MAX</label>
                  <input type="text" className="input-maytara" placeholder="e.g. 6′0″"
                    value={prefs.pref_height_max} onChange={e => updatePref("pref_height_max", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>THEIR ENERGY</label>
                  <select className="select-maytara" value={prefs.pref_energy} onChange={e => updatePref("pref_energy", e.target.value)}>
                    <option value="">No preference</option>
                    {ENERGIES.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>COMMUNICATION STYLE</label>
                  <select className="select-maytara" value={prefs.pref_comm_style} onChange={e => updatePref("pref_comm_style", e.target.value)}>
                    <option value="">No preference</option>
                    {COMM_STYLES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>THEIR MOTHER TONGUE</label>
                <input type="text" className="input-maytara" placeholder="Telugu, Tamil, any..."
                  value={prefs.pref_mother_tongue} onChange={e => updatePref("pref_mother_tongue", e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>THEIR PROFESSION / FIELD</label>
                <input type="text" className="input-maytara" placeholder="Creative field, tech, medicine, doesn't matter..."
                  value={prefs.pref_profession} onChange={e => updatePref("pref_profession", e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-typewriter tracking-widest block mb-1" style={{ color: "var(--ink-muted)" }}>THEIR RELIGION / FAITH</label>
                <input type="text" className="input-maytara" placeholder="Hindu, Muslim, open to all..."
                  value={prefs.pref_religion} onChange={e => updatePref("pref_religion", e.target.value)} />
                <p className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                  Write &ldquo;open&rdquo; or &ldquo;any&rdquo; and we&apos;ll treat faith as something you don&apos;t filter on.
                </p>
              </div>
            </>)}

            <p className="text-xs text-center font-typewriter tracking-wide" style={{ color: "var(--saffron)" }}>
              ✦ After this, you&apos;ll answer 5 quick questions. One word is fine.<br />
              That&apos;s what gets you into the pool — your dashboard is where it all happens from there.
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2"
              style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? "◆ Creating account..." : "◆ Create Account & Start Interview"}
            </button>

            <p className="text-xs text-center leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              By creating an account you agree to our{" "}
              <Link href="/terms" style={{ color: "var(--saffron)" }}>Terms & Privacy Policy</Link>.
              The Mayatara is a free platform for genuine connection. We are not responsible for interactions between users.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
