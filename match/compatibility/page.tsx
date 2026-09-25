"use client";

import { useState } from "react";
import Link from "next/link";
import { LoveCouple, LotusBlossom } from "@/components/ui/SculptureAnim";

const RELATIONSHIP_TYPES = ["Dating", "Friendship", "Co-founder", "Wedding", "Still Figuring Out"];

type Mode = "select" | "pair" | "global";

interface CompatibilityReport {
  overall_score: number;
  personality_match: number;
  values_alignment: number;
  lifestyle_compatibility: number;
  communication_styles: number;
  goals_alignment: number;
  summary: string;
  strengths: string[];
  watchpoints: string[];
  conversation_starters: string[];
  verdict: string;
}

interface GlobalReport {
  percentile: number;
  summary: string;
  your_strongest_trait: string;
  your_blindspot: string;
  what_the_pool_needs_from_you: string;
  top_matches: Array<{ compatibility: number; why: string }>;
}

const FIELDS = [
  { key: "name",         label: "Name",                       placeholder: "Alex",                                              type: "text" },
  { key: "age",          label: "Age",                        placeholder: "28",                                                type: "number" },
  { key: "location",     label: "City",                       placeholder: "Mumbai",                                            type: "text" },
  { key: "profession",   label: "Profession",                 placeholder: "Designer",                                          type: "text" },
  { key: "personality",  label: "Personality",                placeholder: "Introverted, analytical, dry humour...",            type: "textarea" },
  { key: "values",       label: "Core Values",                placeholder: "Honesty, independence, family...",                  type: "textarea" },
  { key: "what_they_want", label: "What they want",           placeholder: "A real partner. Not a project.",                    type: "textarea" },
  { key: "lifestyle",    label: "Lifestyle",                  placeholder: "Early riser, travels when possible...",             type: "text" },
  { key: "dealbreakers", label: "Dealbreakers",               placeholder: "Dishonesty, no ambition...",                        type: "text" },
];

async function shareCard(params: Record<string, string>, filename: string, text: string) {
  const url = "/api/match/compatibility/card?" + new URLSearchParams(params).toString();
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
    // user can still screenshot the result card as a fallback
  }
}

/** Resolves to null on success, or a message to show the user. */
async function downloadPDF(
  report: CompatibilityReport,
  personA: Record<string, string>,
  personB: Record<string, string>,
  lookingFor: string
): Promise<string | null> {
  const res = await fetch("/api/match/report/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      personA: personA.name || "Person A",
      personB: personB.name || "Person B",
      lookingFor,
      overallScore: report.overall_score,
      scores: {
        "Personality Match":       report.personality_match,
        "Values Alignment":        report.values_alignment,
        "Lifestyle Compatibility": report.lifestyle_compatibility,
        "Communication Styles":    report.communication_styles,
        "Goals Alignment":         report.goals_alignment,
      },
      summary: report.summary,
      strengths: report.strengths,
      watchpoints: report.watchpoints,
      conversationStarters: report.conversation_starters,
      verdict: report.verdict,
    }),
  });
  // The route answers 429 (rate limit), 413 and 500 with a JSON body. Saving
  // that straight to disk would hand the user a .pdf that no reader can open,
  // so failures surface as a message instead of a corrupt download.
  if (!res.ok) {
    if (res.status === 429) return "Too many downloads just now — try again in a few minutes.";
    return "Couldn't build the PDF. Your result is still on screen.";
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "oppidx-match-compatibility.pdf";
  a.click();
  URL.revokeObjectURL(url);
  return null;
}

function ProfileForm({ label, data, onChange, labelOverrides }: { label: string; data: Record<string, string>; onChange: (k: string, v: string) => void; labelOverrides?: Record<string, string> }) {
  return (
    <div className="card p-6 flex-1">
      <h3 className="font-typewriter text-base tracking-wide mb-5 flex items-center gap-2" style={{ color: "var(--ink)" }}>
        <span style={{ color: "var(--saffron)" }}>◆</span> {label}
      </h3>
      <div className="flex flex-col gap-4">
        {FIELDS.map((f) => {
          const displayLabel = labelOverrides?.[f.key] || f.label;
          return f.type === "textarea" ? (
            <div key={f.key}>
              <label className="text-xs font-typewriter tracking-wide block mb-1" style={{ color: "var(--ink-muted)" }}>{displayLabel.toUpperCase()}</label>
              <textarea className="input-stamped resize-none" rows={2} placeholder={f.placeholder}
                value={data[f.key] || ""} onChange={(e) => onChange(f.key, e.target.value)} />
            </div>
          ) : (
            <div key={f.key}>
              <label className="text-xs font-typewriter tracking-wide block mb-1" style={{ color: "var(--ink-muted)" }}>{displayLabel.toUpperCase()}</label>
              <input type={f.type} className="input-stamped" placeholder={f.placeholder}
                value={data[f.key] || ""} onChange={(e) => onChange(f.key, e.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "var(--green)" : value >= 60 ? "var(--saffron)" : "var(--maroon)";
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-xs font-typewriter tracking-wide" style={{ color: "var(--ink-muted)" }}>{label.toUpperCase()}</span>
        <span className="text-xs font-typewriter font-bold" style={{ color }}>{value}/100</span>
      </div>
      <div className="w-full h-4 border-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div className="h-full transition-all duration-1000" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── MODE SELECT ──────────────────────────────────────────────
function ModeSelect({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="max-w-3xl mx-auto relative overflow-hidden">
      <div className="absolute -left-6 top-2 pointer-events-none select-none hidden md:block" style={{ opacity: 0.1 }}>
        <LoveCouple style={{ height: 140, color: "var(--saffron)" }} />
      </div>
      <div className="absolute -right-4 bottom-0 pointer-events-none select-none hidden md:block" style={{ opacity: 0.1 }}>
        <LotusBlossom style={{ height: 90, color: "var(--border)" }} />
      </div>
      <div className="text-center mb-10 relative">
        <div className="text-4xl mb-3" style={{ color: "var(--saffron)" }}>✦</div>
        {/* h1, not h2: this is the landing state of an indexed page, so it's
            the document's top-level heading. Styling is all className, so this
            changes the outline and nothing visual. */}
        <h1 className="font-typewriter text-3xl mb-3" style={{ color: "var(--ink)" }}>COMPATIBILITY CHECK</h1>
        <p className="text-sm leading-relaxed max-w-xl mx-auto" style={{ color: "var(--ink-muted)" }}>
          This is not a love meter. It&apos;s an honest analysis of how two people actually fit together —
          or how well one person fits the wider pool of people looking for the same thing.
          Use it to understand, not to decide.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Pair check */}
        <button onClick={() => onSelect("pair")} className="card p-7 text-left transition-all hover:shadow-lg"
          style={{ cursor: "pointer", borderColor: "var(--border)" }}>
          <div className="text-3xl mb-4" style={{ color: "var(--saffron)" }}>◆</div>
          <h3 className="font-typewriter text-lg mb-2" style={{ color: "var(--ink)" }}>TWO-PERSON CHECK</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
            You have two people in mind. You want to know if they actually work —
            personality, values, lifestyle, communication. We tell you the real picture: strengths,
            things to discuss early, and questions to ask on a first meeting.
          </p>
          <div className="text-xs font-typewriter tracking-wide" style={{ color: "var(--saffron)" }}>
            → ENTER BOTH PROFILES
          </div>
        </button>

        {/* Global fit */}
        <button onClick={() => onSelect("global")} className="card p-7 text-left transition-all hover:shadow-lg"
          style={{ cursor: "pointer", borderColor: "var(--saffron)" }}>
          <div className="text-3xl mb-4" style={{ color: "var(--saffron)" }}>❋</div>
          <h3 className="font-typewriter text-lg mb-2" style={{ color: "var(--saffron)" }}>GLOBAL FIT CHECK</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ink-muted)" }}>
            You want to know how you sit in the wider pool. Not compared to one person —
            compared to everyone looking for the same thing. Where are you a strong match?
            What&apos;s your blindspot? What percentile do you land in?
          </p>
          <div className="text-xs font-typewriter tracking-wide" style={{ color: "var(--saffron)" }}>
            → ENTER YOUR PROFILE ONLY ✦ INSTANT RESULT
          </div>
        </button>
      </div>

      <div className="mt-8 p-4 text-xs leading-relaxed" style={{ background: "var(--bg-dark)", border: "1px solid var(--border)", color: "var(--ink-muted)" }}>
        <span className="font-typewriter" style={{ color: "var(--saffron)" }}>◆ HOW THE SCORES WORK — </span>
        Scores are on a scale of 0–100. Above 75 is a strong fit. 60–75 is workable with honest conversation.
        Below 60 doesn&apos;t mean incompatible — it means there are real differences that need to be named, not ignored.
        A 95 doesn&apos;t guarantee anything. A 58 doesn&apos;t rule anyone out.
        Use the breakdown, not just the number.
      </div>
    </div>
  );
}

// ─── PAIR REPORT ─────────────────────────────────────────────
function PairReport({ report, personA, personB, lookingFor, onBack }: {
  report: CompatibilityReport;
  personA: Record<string, string>;
  personB: Record<string, string>;
  lookingFor: string;
  onBack: () => void;
}) {
  const [pdfState, setPdfState] = useState<'idle' | 'busy'>('idle');
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function onDownloadPDF() {
    setPdfError(null);
    setPdfState('busy');
    try {
      setPdfError(await downloadPDF(report, personA, personB, lookingFor));
    } catch {
      setPdfError("Couldn't build the PDF. Your result is still on screen.");
    } finally {
      setPdfState('idle');
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card p-8 text-center mb-6" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
        <div className="text-xs font-typewriter tracking-widest mb-2" style={{ color: "var(--ink-muted)" }}>{lookingFor.toUpperCase()} · TWO-PERSON COMPATIBILITY</div>
        <div className="text-6xl font-typewriter font-bold mb-1" style={{ color: "var(--saffron)" }}>
          {report.overall_score}<span className="text-2xl">/100</span>
        </div>
        <div className="inline-block mt-3 px-5 py-1 font-typewriter tracking-wide stamp-border-saffron" style={{ color: "var(--saffron)" }}>
          {report.verdict}
        </div>
      </div>

      <div className="card p-6 mb-5">
        <h4 className="font-typewriter text-xs tracking-widest mb-4" style={{ color: "var(--ink-muted)" }}>BREAKDOWN</h4>
        <ScoreBar label="Personality Match"       value={report.personality_match} />
        <ScoreBar label="Values Alignment"        value={report.values_alignment} />
        <ScoreBar label="Lifestyle Compatibility" value={report.lifestyle_compatibility} />
        <ScoreBar label="Communication Styles"    value={report.communication_styles} />
        <ScoreBar label="Goals Alignment"         value={report.goals_alignment} />
        <p className="text-xs mt-3" style={{ color: "var(--ink-muted)" }}>
          Each dimension is scored independently. A high overall score with a low Communication score means the connection has potential but will need active work on how you talk to each other.
        </p>
      </div>

      <div className="card p-6 mb-5">
        <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--saffron)" }}>◆ WHAT THE AI SEES</h4>
        <p className="leading-relaxed text-sm" style={{ color: "var(--ink)" }}>{report.summary}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--green)" }}>✦ STRENGTHS</h4>
          {report.strengths.map((s, i) => (
            <div key={i} className="text-sm flex gap-2 mb-2" style={{ color: "var(--ink)" }}>
              <span style={{ color: "var(--green)" }}>✓</span> {s}
            </div>
          ))}
        </div>
        <div className="card p-5">
          <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--maroon)" }}>◆ DISCUSS EARLY — NOT LATER</h4>
          {report.watchpoints.map((w, i) => (
            <div key={i} className="text-sm flex gap-2 mb-2" style={{ color: "var(--ink)" }}>
              <span style={{ color: "var(--maroon)" }}>!</span> {w}
            </div>
          ))}
          <p className="text-xs mt-2" style={{ color: "var(--ink-muted)" }}>
            These aren&apos;t red flags. They&apos;re things that will come up eventually. Better to surface them early.
          </p>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--saffron)" }}>✦ QUESTIONS FOR YOUR FIRST MEETING</h4>
        <p className="text-xs mb-3" style={{ color: "var(--ink-muted)" }}>
          These are based on the specific gaps and strengths in this pair — not generic first-date questions.
        </p>
        {report.conversation_starters.map((q, i) => (
          <div key={i} className="text-sm p-3 mb-2" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--ink)" }}>
            <span className="font-typewriter" style={{ color: "var(--saffron)" }}>{i + 1}. </span>{q}
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center flex-wrap">
        <button onClick={onBack} className="btn-secondary">← New Check</button>
        <button
          onClick={() => shareCard(
            {
              type: "pair",
              score: String(report.overall_score),
              verdict: report.verdict,
              relationshipType: lookingFor,
              nameA: personA.name || "",
              nameB: personB.name || "",
            },
            "oppidx-match-compatibility.png",
            `${report.overall_score}/100 on OppIDX Match ${lookingFor} check ✦ oppidx.com/match/compatibility`
          )}
          className="btn-primary"
        >
          ◆ Share Result
        </button>
        <button
          onClick={onDownloadPDF}
          disabled={pdfState === 'busy'}
          className="btn-secondary"
          style={{ opacity: pdfState === 'busy' ? 0.6 : 1 }}
        >
          {pdfState === 'busy' ? 'Building PDF…' : '↓ Download PDF'}
        </button>
      </div>
      {pdfError && (
        <p className="text-xs text-center mt-3" style={{ color: "var(--maroon)" }} role="status">
          {pdfError}
        </p>
      )}
    </div>
  );
}

// ─── GLOBAL REPORT ───────────────────────────────────────────
function GlobalReport({ report, relationshipType, onBack }: { report: GlobalReport; relationshipType: string; onBack: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-8 text-center mb-6" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
        <div className="text-xs font-typewriter tracking-widest mb-2" style={{ color: "var(--ink-muted)" }}>
          GLOBAL FIT · ACTIVE POOL
        </div>
        <div className="text-6xl font-typewriter font-bold mb-1" style={{ color: "var(--saffron)" }}>
          Top {100 - report.percentile}%
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--ink-muted)" }}>
          You are a stronger fit than {report.percentile}% of profiles in this pool.
        </p>
      </div>

      <div className="card p-6 mb-5">
        <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--saffron)" }}>◆ WHAT THE AI SEES</h4>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{report.summary}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <div className="card p-4">
          <div className="font-typewriter text-xs tracking-wide mb-2" style={{ color: "var(--green)" }}>YOUR STRONGEST TRAIT</div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>{report.your_strongest_trait}</p>
        </div>
        <div className="card p-4">
          <div className="font-typewriter text-xs tracking-wide mb-2" style={{ color: "var(--maroon)" }}>YOUR BLINDSPOT</div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>{report.your_blindspot}</p>
        </div>
        <div className="card p-4">
          <div className="font-typewriter text-xs tracking-wide mb-2" style={{ color: "var(--saffron)" }}>WHAT THE POOL NEEDS FROM YOU</div>
          <p className="text-sm" style={{ color: "var(--ink)" }}>{report.what_the_pool_needs_from_you}</p>
        </div>
      </div>

      {report.top_matches.length > 0 && (
        <div className="card p-6 mb-6">
          <h4 className="font-typewriter text-xs tracking-widest mb-3" style={{ color: "var(--saffron)" }}>◆ YOUR TOP ANONYMOUS MATCHES IN THE POOL</h4>
          <p className="text-xs mb-3" style={{ color: "var(--ink-muted)" }}>
            These are real profiles (anonymised). To get their contact, create an account and join the weekly Friday match.
          </p>
          {report.top_matches.map((m, i) => (
            <div key={i} className="p-3 mb-2 flex gap-3 items-start" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <span className="font-typewriter text-lg flex-shrink-0" style={{ color: "var(--saffron)" }}>{m.compatibility}%</span>
              <p className="text-sm" style={{ color: "var(--ink)" }}>{m.why}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 justify-center flex-wrap">
        <button onClick={onBack} className="btn-secondary">← New Check</button>
        <button
          onClick={() => shareCard(
            {
              type: "global",
              percentile: String(report.percentile),
              relationshipType,
            },
            "oppidx-match-global-fit.png",
            `Top ${100 - report.percentile}% on OppIDX Match Global Fit Check ✦ oppidx.com/match/compatibility`
          )}
          className="btn-primary"
        >
          ◆ Share Result
        </button>
        <Link href="/account/register" className="btn-primary">◆ Join the Match Pool</Link>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function CompatibilityPage() {
  const [mode, setMode] = useState<Mode>("select");
  const [relationshipType, setRelationshipType] = useState("");
  const [personA, setPersonA] = useState<Record<string, string>>({});
  const [personB, setPersonB] = useState<Record<string, string>>({});
  const [pairReport, setPairReport] = useState<CompatibilityReport | null>(null);
  const [globalReport, setGlobalReport] = useState<GlobalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() { setMode("select"); setPairReport(null); setGlobalReport(null); setError(""); }

  async function runPairCheck() {
    setError("");
    if (!relationshipType) { setError("Select a relationship type first."); return; }
    const required = ["name", "personality", "values", "what_they_want"];
    for (const k of required) {
      if (!personA[k] || !personB[k]) { setError("Fill in Name, Personality, Values, and What They Want for both people."); return; }
    }
    setLoading(true);
    try {
      const res = await fetch("/api/match/compatibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personA, personB, relationshipType }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPairReport(data.report);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function runGlobalCheck() {
    setError("");
    if (!relationshipType) { setError("Select a relationship type first."); return; }
    if (!personA.name || !personA.personality || !personA.values) {
      setError("Fill in at least Name, Personality, and Values.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/match/compatibility/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: personA, relationshipType }),
      });
      const data = await res.json();
      if (data.error === "not_enough_pool" || data.error === "missing_fields") {
        setError(data.message || "Not enough data to run this check yet.");
        return;
      }
      if (data.error) throw new Error(data.message || "Something went wrong.");
      setGlobalReport(data.report);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--pin)" }}>← OppIDX</Link>
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>COMPATIBILITY</span>
        </div>
      </header>

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-10 relative z-10">

        {/* Mode select */}
        {mode === "select" && <ModeSelect onSelect={setMode} />}

        {/* Pair check */}
        {mode === "pair" && !pairReport && (
          <div className="max-w-5xl mx-auto">
            <button onClick={reset} className="btn-secondary text-xs mb-6">← Back</button>
            <h2 className="font-typewriter text-2xl mb-2 text-center" style={{ color: "var(--ink)" }}>TWO-PERSON COMPATIBILITY</h2>
            <p className="text-sm text-center mb-6" style={{ color: "var(--ink-muted)" }}>
              Fill in both profiles as honestly as possible. The more real the input, the more honest the output.
            </p>

            <div className="max-w-xs mx-auto mb-6">
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--ink-muted)" }}>CONTEXT: WHAT KIND OF CONNECTION?</label>
              <select className="select-stamped" value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)}>
                <option value="">— choose —</option>
                {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="flex flex-col lg:flex-row gap-5 mb-6">
              <ProfileForm label="PERSON ONE" data={personA} onChange={(k, v) => setPersonA(p => ({ ...p, [k]: v }))} />
              <div className="hidden lg:flex items-center justify-center text-3xl" style={{ color: "var(--border)" }}>✦</div>
              <ProfileForm label="PERSON TWO" data={personB} onChange={(k, v) => setPersonB(p => ({ ...p, [k]: v }))} />
            </div>

            {error && <div className="mb-4 p-4 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>◆ {error}</div>}
            <div className="text-center">
              <button onClick={runPairCheck} disabled={loading} className="btn-primary text-lg px-10 py-4" style={{ opacity: loading ? 0.6 : 1 }}>
                {loading ? "◆ Analysing..." : "◆ Generate Report"}
              </button>
            </div>
          </div>
        )}

        {/* Pair report */}
        {mode === "pair" && pairReport && (
          <PairReport report={pairReport} personA={personA} personB={personB} lookingFor={relationshipType} onBack={reset} />
        )}

        {/* Global check */}
        {mode === "global" && !globalReport && (
          <div className="max-w-xl mx-auto">
            <button onClick={reset} className="btn-secondary text-xs mb-6">← Back</button>
            <h2 className="font-typewriter text-2xl mb-2 text-center" style={{ color: "var(--ink)" }}>GLOBAL FIT CHECK</h2>
            <p className="text-sm text-center mb-6 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
              We compare your profile against everyone in the OppIDX Match pool looking for the same thing.
              You get a percentile, your strongest trait, your blindspot, and anonymised glimpses of your top matches.
            </p>

            <div className="max-w-xs mx-auto mb-6">
              <label className="text-xs font-typewriter tracking-widest block mb-2" style={{ color: "var(--ink-muted)" }}>WHAT ARE YOU LOOKING FOR?</label>
              <select className="select-stamped" value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)}>
                <option value="">— choose —</option>
                {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="card p-6 mb-6">
              <ProfileForm label="YOUR PROFILE" data={personA} onChange={(k, v) => setPersonA(p => ({ ...p, [k]: v }))}
                labelOverrides={{ what_they_want: "What you want" }} />
            </div>

            {error && <div className="mb-4 p-4 text-sm font-typewriter" style={{ background: "#FFF0F0", border: "2px solid var(--maroon)", color: "var(--maroon)" }}>◆ {error}</div>}
            <div className="text-center">
              <button onClick={runGlobalCheck} disabled={loading} className="btn-primary text-lg px-10 py-4" style={{ opacity: loading ? 0.6 : 1 }}>
                {loading ? "◆ Checking the pool..." : "❋ Check My Global Fit"}
              </button>
            </div>
          </div>
        )}

        {/* Global report */}
        {mode === "global" && globalReport && (
          <GlobalReport report={globalReport} relationshipType={relationshipType} onBack={reset} />
        )}
      </div>
    </div>
  );
}
