"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];

const TYPE_DESCRIPTIONS: Record<string, string> = {
  "Dating":             "You want to meet someone real. Not a profile. A person.",
  "Friendship":         "You're looking for someone who actually gets you — no agenda, just connection.",
  "Co-founder":         "Someone to build something with. Work chemistry is real chemistry.",
  "Wedding":           "You're serious. You want the whole thing — the life, not just the honeymoon.",
  "Still Figuring Out": "You don't have a label for it yet. That's fine. Start honest.",
};

const QUESTIONS: Record<string, string[]> = {
  "Dating": [
    "What's the most alive you've felt in the last month?",
    "How important is physical attraction to you, really? And are you actually honest with yourself about that?",
    "What do you want in a relationship that you'd be almost embarrassed to say out loud?",
    "Would you move cities for someone you loved, even if it set your career back by years?",
    "What would make you walk away from someone — no matter how much you liked them?",
  ],
  "Friendship": [
    "What are you done pretending to enjoy?",
    "If your closest friend's partner was cheating on them — would you tell them?",
    "What do you bring to a friendship that most people can't?",
    "Do you think most people are fundamentally good — or mostly looking out for themselves?",
    "What would a friendship that actually fits you look like right now?",
  ],
  "Co-founder": [
    "What are you building, or obsessed with building?",
    "If your co-founder wanted a salary before you had a single dollar of revenue — how would that sit with you?",
    "Have you ever walked away from a collaboration? What actually happened — and what was your part in it?",
    "Trust or complementary skills — if you had to pick one in a co-founder, which do you choose?",
    "What would make you walk away from a co-founder, even mid-build?",
  ],
  "Wedding": [
    "What does your life actually look like right now, honestly?",
    "Joint family or nuclear — what do you actually want, not what sounds acceptable?",
    "If you had to choose: a partner who loves you more than you love them, or one you love more than they love you — which do you pick?",
    "Whose career takes priority if there's ever a real conflict — and are you actually okay with that?",
    "What would make you walk away — no exceptions, no second chances?",
  ],
  "Still Figuring Out": [
    "What's something you want but haven't admitted to yourself yet?",
    "What kind of connection have you had that felt really right? What made it that way?",
    "Do you think people can genuinely change their core personality — or are we mostly who we already are?",
    "What are you done with? Things you've outgrown, situations you're not going back to.",
    "If you had to describe what you're looking for in one honest sentence — what would you say?",
  ],
};

const TYPE_STEPS: Record<string, string[]> = {
  "Dating":             ["Spark", "Truth", "Edge", "Depth", "Line", "Done"],
  "Friendship":         ["World", "Vibe", "Truth", "Edge", "Bond", "Done"],
  "Co-founder":         ["Spark", "Grind", "Real", "Trust", "Line", "Done"],
  "Wedding":           ["Roots", "Values", "Life", "Hard", "Line", "Done"],
  "Still Figuring Out": ["Now", "Pull", "Real", "Done?", "Truth", "Done"],
};

function stepForIndex(total: number, current: number): number {
  if (current === 0) return 0;
  if (current >= total) return 4;
  return Math.min(3, Math.ceil((current / total) * 4));
}

interface Answer { question: string; answer: string }

interface PendingSignup { userId: string; contact: string; contactType: string; prefs: Record<string, string> }

const CONTACT_TYPES = [
  { value: "phone", label: "Phone number" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram handle" },
  { value: "telegram", label: "Telegram username" },
  { value: "snapchat", label: "Snapchat username" },
  { value: "twitter", label: "X / Twitter handle" },
  { value: "linkedin", label: "LinkedIn profile URL" },
  { value: "email", label: "Email address" },
  { value: "letterpost", label: "Letter post (address) 📮" },
];

function InterviewInner() {
  const params = useSearchParams();
  const initialType = params.get("type") || "";

  // Pending signup details (userId/contact/prefs) are handed off via sessionStorage,
  // not the URL — phone numbers and addresses have no business sitting in browser
  // history or server logs before they're ever encrypted.
  const [pending] = useState<PendingSignup | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("match_pending_signup");
      return raw ? (JSON.parse(raw) as PendingSignup) : null;
    } catch { return null; }
  });

  // Coming straight from registration (a pending signup + a valid type already chosen) —
  // skip the redundant "choose type" screen and go straight into the questions.
  const cameFromRegistration = Boolean(pending?.userId) && TYPES.includes(initialType);

  const [relationshipType, setRelationshipType] = useState(initialType);
  const [started, setStarted] = useState(cameFromRegistration);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // A logged-in user with no `pending` sessionStorage payload (new tab,
  // returned via the dashboard's "finish your interview" link after the
  // original registration tab is long gone, sessionStorage cleared, etc.)
  // used to land on a dead end here — told "you're not registered" and sent
  // back to /register, even though they already have an account. This
  // checks the real auth session so that case can recover instead: if
  // they're genuinely logged in, ask for the one missing piece (contact
  // info) again rather than discarding a completed interview.
  const [hasAuthSession, setHasAuthSession] = useState<boolean | null>(null);
  useEffect(() => {
    if (pending) { setHasAuthSession(true); return; }
    import("@/lib/platform/supabase").then(({ supabase }) =>
      supabase.auth.getSession().then(({ data: { session } }) => setHasAuthSession(!!session))
    );
  }, [pending]);

  const [recoveryContact, setRecoveryContact] = useState("");
  const [recoveryContactType, setRecoveryContactType] = useState("whatsapp");
  const [recoverySaved, setRecoverySaved] = useState(false);

  const questions = QUESTIONS[relationshipType] || QUESTIONS["Still Figuring Out"];
  const steps = TYPE_STEPS[relationshipType] || TYPE_STEPS["Still Figuring Out"];
  const step = done ? 4 : stepForIndex(questions.length, questionIndex);
  const currentQuestion = questions[questionIndex];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answers, questionIndex]);

  useEffect(() => {
    if (started && !done) inputRef.current?.focus();
  }, [started, questionIndex, done]);

  function begin() {
    if (!relationshipType) return;
    setStarted(true);
  }

  async function saveProfile(finalAnswers: Answer[], contact: string, contactType: string, prefs: Record<string, string>) {
    setSaving(true);
    setSaveFailed(false);
    const profileJson: Record<string, string> = {};
    finalAnswers.forEach((a, i) => { profileJson[`q${i + 1}`] = a.answer; });
    Object.assign(profileJson, prefs || {});
    try {
      const { supabase } = await import("@/lib/platform/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("no-session");
      const res = await fetch("/api/match/profile/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lookingFor: relationshipType, profileJson, contact, contactType }),
      });
      if (!res.ok) throw new Error("save-failed");
      try { sessionStorage.removeItem("match_pending_signup"); } catch { /* ignore */ }
      return true;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    const newAnswers = [...answers, { question: currentQuestion, answer: text }];
    setAnswers(newAnswers);
    setInput("");
    if (questionIndex + 1 >= questions.length) {
      if (pending?.contact) {
        await saveProfile(newAnswers, pending.contact, pending.contactType, pending.prefs || {});
      }
      setDone(true);
    } else {
      setQuestionIndex(questionIndex + 1);
    }
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryContact.trim()) return;
    const ok = await saveProfile(answers, recoveryContact.trim(), recoveryContactType, {});
    if (ok) setRecoverySaved(true);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!started) {
    return (
      <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
            <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>THE INTERVIEW</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-16 relative z-10">
          <div className="card p-10 max-w-md w-full text-center">
            <div className="text-3xl mb-5" style={{ color: "var(--saffron)" }}>◆</div>
            {/* h1, not h2: this is the landing state, so it's the document's
                top-level heading. Styling is all className — outline only. */}
            <h1 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>ONE QUESTION FIRST.</h1>
            <p className="mb-8 text-sm leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              What are you actually looking for? Your answer changes every question that follows.
              No judgment. Just honesty.
            </p>
            <div className="text-left mb-2">
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--ink-muted)" }}>
                I&apos;M LOOKING FOR —
              </label>
              <select className="select-stamped" value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value)}>
                <option value="">— choose —</option>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {relationshipType && (
              <p className="text-xs mt-3 mb-6 text-left italic" style={{ color: "var(--ink-muted)" }}>
                {TYPE_DESCRIPTIONS[relationshipType]}
              </p>
            )}
            <button onClick={begin} disabled={!relationshipType} className="btn-primary w-full py-3 text-base mt-4"
              style={{ opacity: !relationshipType ? 0.4 : 1 }}>
              ◆ &nbsp; Let&apos;s Go
            </button>
            <p className="text-xs mt-4" style={{ color: "var(--ink-muted)" }}>Private. Nothing shared without you saying so.</p>
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
          <div className="flex items-center gap-3">
            <span className="text-xs font-typewriter px-2 py-1"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--saffron)" }}>
              {relationshipType}
            </span>
            <button onClick={() => { setStarted(false); setAnswers([]); setQuestionIndex(0); setDone(false); }}
              className="text-xs font-typewriter" style={{ color: "var(--ink-muted)" }}>
              change ↺
            </button>
          </div>
        </div>
      </header>

      <div className="border-b-2 relative z-10" style={{ borderColor: "var(--border)", background: "var(--bg-dark)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-shrink-0">
                <div className={`w-7 h-7 flex items-center justify-center text-xs font-typewriter ${i < step ? "step-done" : i === step ? "step-active" : "step-pending"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs font-typewriter tracking-wide hidden sm:inline"
                  style={{ color: i <= step ? "var(--ink)" : "var(--ink-muted)" }}>{s}</span>
                {i < steps.length - 1 && <div className="w-4 h-px mx-1" style={{ background: "var(--border)" }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-4 relative z-10">
        <div className="flex-1 card overflow-y-auto p-6 flex flex-col gap-4" style={{ minHeight: "60vh", maxHeight: "65vh" }}>
          {answers.map((a, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed"
                  style={{ background: "var(--card)", border: "2px solid var(--border)", boxShadow: "3px 3px 0 var(--border)", color: "var(--ink)", fontFamily: "'Courier Prime', monospace" }}>
                  <span className="text-xs tracking-widest block mb-2 font-typewriter" style={{ color: "var(--saffron)" }}>◆ OPPIDX MATCH</span>
                  {a.question}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed"
                  style={{ background: "var(--saffron)", border: "2px solid var(--maroon)", boxShadow: "3px 3px 0 var(--maroon)", color: "var(--btn-text)", fontFamily: "'Courier Prime', monospace" }}>
                  {a.answer}
                </div>
              </div>
            </div>
          ))}

          {!done && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed"
                style={{ background: "var(--card)", border: "2px solid var(--border)", boxShadow: "3px 3px 0 var(--border)", color: "var(--ink)", fontFamily: "'Courier Prime', monospace" }}>
                <span className="text-xs tracking-widest block mb-2 font-typewriter" style={{ color: "var(--saffron)" }}>◆ OPPIDX MATCH</span>
                {currentQuestion}
              </div>
            </div>
          )}

          {done && (pending || recoverySaved) && !saveFailed && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--saffron)" }}>YOU&apos;RE IN THE POOL.</h3>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--ink)" }}>
                Your profile is submitted. Every Friday night, the AI runs.<br />
                Your match — if found — will be waiting on your dashboard.
              </p>

              <div className="w-full px-6 py-5 mb-6 font-typewriter text-center"
                style={{ background: "var(--maroon)", color: "var(--btn-text)", border: "2px solid var(--maroon)" }}>
                <div className="text-xs tracking-widest mb-1 opacity-70">WRITE THIS DOWN IF YOU HAVE TO</div>
                <div className="text-lg tracking-wide">COME BACK FRIDAY EVENING.</div>
                <div className="text-xs tracking-widest mt-1 opacity-70">CHECK YOUR DASHBOARD. YOUR MATCH WILL BE THERE.</div>
              </div>

              <p className="text-xs leading-relaxed mb-6" style={{ color: "var(--ink-muted)" }}>
                No app notifications. No reminders. No inbox spam.<br />
                Just you, Friday evening, and your dashboard.
              </p>

              <Link href="/account/dashboard" className="btn-primary text-sm px-6 py-3 w-full text-center block">
                ◆ &nbsp; Go to My Dashboard
              </Link>
              <div className="mt-4">
                <Link href="/match/compatibility" className="text-xs font-typewriter"
                  style={{ color: "var(--saffron)", textDecoration: "underline" }}>
                  ✦ While you wait — check compatibility with someone you know
                </Link>
              </div>
            </div>
          )}

          {done && saveFailed && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--maroon)", boxShadow: "5px 5px 0 var(--maroon)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--maroon)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--maroon)" }}>YOUR ANSWERS WEREN&apos;T SAVED.</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink)" }}>
                Something went wrong saving your profile — you&apos;re not in the pool yet.
                Log back in and try the interview again from your dashboard.
              </p>
              <Link href="/account" className="btn-primary text-sm px-6 py-3 w-full text-center block">
                ◆ &nbsp; Log In &amp; Try Again
              </Link>
            </div>
          )}

          {/* Logged in (real session, not just a completed sessionStorage
              handoff) but the pending contact info from registration is
              gone — ask for it again instead of discarding a finished
              interview and wrongly telling an existing user to re-register. */}
          {done && !pending && !saveFailed && !recoverySaved && hasAuthSession === true && (
            <div className="card p-8" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="text-4xl mb-4 text-center" style={{ color: "var(--saffron)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3 text-center" style={{ color: "var(--saffron)" }}>ONE LAST THING.</h3>
              <p className="text-sm leading-relaxed mb-6 text-center" style={{ color: "var(--ink)" }}>
                Your answers are ready, but we lost the contact info from when you registered
                (a new tab, a cleared session — it happens). How should a match reach you?
              </p>
              <form onSubmit={submitRecovery} className="flex flex-col gap-3">
                <select className="select-stamped" value={recoveryContactType}
                  onChange={(e) => setRecoveryContactType(e.target.value)}>
                  {CONTACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input className="input-stamped" required value={recoveryContact}
                  onChange={(e) => setRecoveryContact(e.target.value)}
                  placeholder="Your contact info" />
                <button type="submit" disabled={saving || !recoveryContact.trim()} className="btn-primary py-3"
                  style={{ opacity: saving || !recoveryContact.trim() ? 0.5 : 1 }}>
                  {saving ? "Saving…" : "◆  Join the Pool"}
                </button>
              </form>
            </div>
          )}

          {done && !pending && hasAuthSession === false && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--saffron)" }}>THAT&apos;S THE INTERVIEW.</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink)" }}>
                These answers weren&apos;t saved anywhere — you&apos;re not registered yet, so there&apos;s no
                profile to put in the pool. Create an account to actually get matched.
              </p>
              <Link href="/account/register" className="btn-primary text-sm px-6 py-3 w-full text-center block">
                ◆ &nbsp; Create Account
              </Link>
              <div className="mt-4">
                <Link href="/match/compatibility" className="text-xs font-typewriter"
                  style={{ color: "var(--saffron)", textDecoration: "underline" }}>
                  ✦ Or check compatibility with someone you know
                </Link>
              </div>
            </div>
          )}

          {done && !pending && hasAuthSession === null && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--border)" }}>
              <div className="text-2xl animate-pulse" style={{ color: "var(--saffron)" }}>◆</div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {!done && (
          <>
            <div className="flex gap-3 items-end">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Answer here... (Enter to send)"
                rows={2} className="input-stamped resize-none" style={{ flex: 1 }} />
              <button onClick={send} disabled={!input.trim()} className="btn-primary px-5 py-3 flex-shrink-0"
                style={{ opacity: !input.trim() ? 0.5 : 1 }}>
                SEND →
              </button>
            </div>
            <p className="text-xs text-center" style={{ color: "var(--ink-muted)" }}>
              {questionIndex + 1} of {questions.length} · Enter to send · Shift+Enter for new line
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--bg)", minHeight: "100vh" }} />}>
      <InterviewInner />
    </Suspense>
  );
}
