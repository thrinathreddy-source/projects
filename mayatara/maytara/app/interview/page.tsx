"use client";

import { useState, useRef, useEffect, useMemo, useSyncExternalStore, Suspense } from "react";
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

type Outcome = "saved" | "failed" | "anonymous";

// sessionStorage is written once by /register before navigating here and never
// changes while this page is mounted, so there is nothing to subscribe to.
const PENDING_KEY = "mayatara_pending_signup";
const SERVER_SNAPSHOT = "\u0000server";

function subscribeToPendingSignup(): () => void {
  return () => {};
}

function readPendingSignup(): string {
  try {
    return sessionStorage.getItem(PENDING_KEY) ?? "";
  } catch {
    return ""; // storage blocked (private mode, embedded webview)
  }
}

function readServerSnapshot(): string {
  return SERVER_SNAPSHOT;
}

function InterviewInner() {
  const params = useSearchParams();
  const initialType = params.get("type") || "";

  // Pending signup details (userId/contact/prefs) are handed off via sessionStorage,
  // not the URL — phone numbers and addresses have no business sitting in browser
  // history or server logs before they're ever encrypted.
  //
  // Read through useSyncExternalStore rather than a state initialiser or an
  // effect. sessionStorage does not exist on the server, so seeding the first
  // render from it made the server render the "choose type" screen while the
  // client rendered the questions — a hydration mismatch on the one path every
  // new signup takes, which had React throw out the server HTML and re-render
  // the tree. This hook is built for a client-only store with a different
  // server snapshot: the hydration pass uses the server value (both sides
  // agree), then React re-renders with the real one. Doing it in an effect
  // instead means setState during hydration, which is its own problem.
  const rawPending = useSyncExternalStore(subscribeToPendingSignup, readPendingSignup, readServerSnapshot);
  const hydrated = rawPending !== SERVER_SNAPSHOT;

  const pending = useMemo<PendingSignup | null>(() => {
    if (!hydrated || !rawPending) return null;
    try {
      return JSON.parse(rawPending) as PendingSignup;
    } catch {
      return null;
    }
  }, [hydrated, rawPending]);

  // Coming straight from registration (a pending signup + a valid type already
  // chosen) — skip the redundant "choose type" screen. Derived, not assigned in
  // an effect, so there is no second render pass to sequence.
  const cameFromRegistration = Boolean(pending?.userId) && TYPES.includes(initialType);

  const [relationshipType, setRelationshipType] = useState(initialType);
  const [startedManually, setStartedManually] = useState(false);
  const started = startedManually || cameFromRegistration;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  // What actually happened at the end, rather than three overlapping booleans.
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Someone who already has an account can redo the interview from their
  // dashboard. That route has no pending signup in sessionStorage, and the old
  // save was gated on pending.contact alone — so their answers were dropped and
  // they were told to "create an account" they already had.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setSignedIn(Boolean(session));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    setStartedManually(true);
  }

  async function saveProfile(finalAnswers: Answer[]) {
    const profileJson: Record<string, string> = {};
    finalAnswers.forEach((a, i) => { profileJson[`q${i + 1}`] = a.answer; });
    Object.assign(profileJson, pending?.prefs || {});

    const { supabase } = await import("@/lib/supabase");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("no-session");

    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      // No contact on a redo — the server keeps the one already stored rather
      // than asking for a phone number a second time.
      body: JSON.stringify({
        lookingFor: relationshipType,
        profileJson,
        ...(pending?.contact ? { contact: pending.contact, contactType: pending.contactType } : {}),
      }),
    });
    if (!res.ok) throw new Error("save-failed");
    try { sessionStorage.removeItem("mayatara_pending_signup"); } catch { /* ignore */ }
  }

  // Retry without making them retype five answers — they are still in state.
  async function retrySave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveProfile(answers);
      setOutcome("saved");
    } catch {
      setOutcome("failed");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function send() {
    // The send button is disabled mid-save, but Enter still reaches this, and
    // a second run at the last question posted the profile twice — the second
    // time with a sixth answer appended.
    if (savingRef.current) return;
    const text = input.trim();
    if (!text) return;
    const newAnswers = [...answers, { question: currentQuestion, answer: text }];
    setAnswers(newAnswers);
    setInput("");
    if (questionIndex + 1 >= questions.length) {
      // Only short-circuit to "anonymous" once we've definitively confirmed
      // there's no session — signedIn starts null and resolves asynchronously,
      // so a fast typist (answers can be one word, as advertised at signup)
      // can reach here before that check settles. Racing on the stale null
      // used to discard a signed-in user's answers with no way to retry.
      // saveProfile() below does its own live getSession() call, so when
      // signedIn is still unknown (or true) we let that be the real check.
      if (!pending?.contact && signedIn === false) {
        setOutcome("anonymous");
        setDone(true);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      setDone(true);
      try {
        await saveProfile(newAnswers);
        setOutcome("saved");
      } catch (e) {
        setOutcome(e instanceof Error && e.message === "no-session" ? "anonymous" : "failed");
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
    } else {
      setQuestionIndex(questionIndex + 1);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (saving) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!hydrated) {
    return <div style={{ background: "var(--bg)", minHeight: "100vh" }} />;
  }

  if (!started) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
            <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>THE INTERVIEW</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-16 relative z-10">
          <div className="card p-10 max-w-md w-full text-center">
            <div className="text-3xl mb-5" style={{ color: "var(--saffron)" }}>◆</div>
            <h2 className="font-typewriter text-2xl mb-3" style={{ color: "var(--ink)" }}>ONE QUESTION FIRST.</h2>
            <p className="mb-8 text-sm leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              What are you actually looking for? Your answer changes every question that follows.
              No judgment. Just honesty.
            </p>
            <div className="text-left mb-2">
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--ink-muted)" }}>
                I&apos;M LOOKING FOR —
              </label>
              <select className="select-maytara" value={relationshipType}
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-typewriter px-2 py-1"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--saffron)" }}>
              {relationshipType}
            </span>
            <button onClick={() => { setStartedManually(false); setAnswers([]); setQuestionIndex(0); setDone(false); }}
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
                  <span className="text-xs tracking-widest block mb-2 font-typewriter" style={{ color: "var(--saffron)" }}>◆ THE MAYATARA</span>
                  {a.question}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed"
                  style={{ background: "var(--saffron)", border: "2px solid var(--maroon)", boxShadow: "3px 3px 0 var(--maroon)", color: "#FAF0D7", fontFamily: "'Courier Prime', monospace" }}>
                  {a.answer}
                </div>
              </div>
            </div>
          ))}

          {saving && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed animate-pulse"
                style={{ background: "var(--card)", border: "2px solid var(--saffron)", boxShadow: "3px 3px 0 var(--saffron)", color: "var(--ink-muted)", fontFamily: "'Courier Prime', monospace" }}>
                <span className="text-xs tracking-widest block mb-2 font-typewriter" style={{ color: "var(--saffron)" }}>◆ THE MAYATARA</span>
                Saving your answers...
              </div>
            </div>
          )}

          {!done && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed"
                style={{ background: "var(--card)", border: "2px solid var(--border)", boxShadow: "3px 3px 0 var(--border)", color: "var(--ink)", fontFamily: "'Courier Prime', monospace" }}>
                <span className="text-xs tracking-widest block mb-2 font-typewriter" style={{ color: "var(--saffron)" }}>◆ THE MAYATARA</span>
                {currentQuestion}
              </div>
            </div>
          )}

          {done && outcome === "saved" && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--saffron)" }}>YOU&apos;RE IN THE POOL.</h3>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--ink)" }}>
                Your profile is submitted. Every Friday night, the AI runs.<br />
                Your match — if found — will be waiting on your dashboard.
              </p>

              <div className="w-full px-6 py-5 mb-6 font-typewriter text-center"
                style={{ background: "var(--maroon)", color: "#FAF0D7", border: "2px solid var(--maroon)" }}>
                <div className="text-xs tracking-widest mb-1 opacity-70">WRITE THIS DOWN IF YOU HAVE TO</div>
                <div className="text-lg tracking-wide">COME BACK FRIDAY EVENING.</div>
                <div className="text-xs tracking-widest mt-1 opacity-70">CHECK YOUR DASHBOARD. YOUR MATCH WILL BE THERE.</div>
              </div>

              <p className="text-xs leading-relaxed mb-6" style={{ color: "var(--ink-muted)" }}>
                No app notifications. No reminders. No inbox spam.<br />
                Just you, Friday evening, and your dashboard.
              </p>

              <Link href="/dashboard" className="btn-primary text-sm px-6 py-3 w-full text-center block">
                ◆ &nbsp; Go to My Dashboard
              </Link>
              <div className="mt-4">
                <Link href="/compatibility" className="text-xs font-typewriter"
                  style={{ color: "var(--saffron)", textDecoration: "underline" }}>
                  ✦ While you wait — check compatibility with someone you know
                </Link>
              </div>
            </div>
          )}

          {done && outcome === "failed" && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--maroon)", boxShadow: "5px 5px 0 var(--maroon)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--maroon)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--maroon)" }}>YOUR ANSWERS WEREN&apos;T SAVED.</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink)" }}>
                Something went wrong saving your profile — you&apos;re not in the pool yet.
                Your answers are still here, so this only needs one more try.
              </p>
              <button onClick={retrySave} disabled={saving}
                className="btn-primary text-sm px-6 py-3 w-full text-center block"
                style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "◆ 　 Try Saving Again"}
              </button>
              <Link href="/login" className="text-xs font-typewriter mt-4 inline-block"
                style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
                Or log in and start over
              </Link>
            </div>
          )}

          {done && outcome === "anonymous" && (
            <div className="card p-8 text-center" style={{ borderColor: "var(--saffron)", boxShadow: "5px 5px 0 var(--saffron)" }}>
              <div className="text-4xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
              <h3 className="font-typewriter text-xl mb-3" style={{ color: "var(--saffron)" }}>THAT&apos;S THE INTERVIEW.</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink)" }}>
                These answers weren&apos;t saved anywhere — you&apos;re not registered yet, so there&apos;s no
                profile to put in the pool. Create an account to actually get matched.
              </p>
              <Link href="/register" className="btn-primary text-sm px-6 py-3 w-full text-center block">
                ◆ &nbsp; Create Account
              </Link>
              <div className="mt-4">
                <Link href="/compatibility" className="text-xs font-typewriter"
                  style={{ color: "var(--saffron)", textDecoration: "underline" }}>
                  ✦ Or check compatibility with someone you know
                </Link>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {!done && (
          <>
            <div className="flex gap-3 items-end">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey} disabled={saving}
                placeholder={saving ? "Saving your answers..." : "Answer here... (Enter to send)"}
                rows={2} className="input-maytara resize-none" style={{ flex: 1, opacity: saving ? 0.6 : 1 }} />
              <button onClick={send} disabled={!input.trim() || saving} className="btn-primary px-5 py-3 flex-shrink-0"
                style={{ opacity: !input.trim() || saving ? 0.5 : 1 }}>
                {saving ? "..." : "SEND →"}
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
