"use client";

import Link from "next/link";

export default function MatchPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-typewriter text-xl tracking-wider" style={{ color: "var(--saffron)" }}>THE MAYATARA</Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="card p-12 max-w-lg w-full text-center" style={{ borderColor: "var(--saffron)", boxShadow: "6px 6px 0 var(--saffron)" }}>
          <div className="text-5xl mb-6" style={{ color: "var(--saffron)" }}>◆</div>
          <h2 className="font-typewriter text-3xl mb-4" style={{ color: "var(--ink)" }}>
            MATCHES DROP<br />ON FRIDAY.
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--ink-muted)" }}>
            We don&apos;t do browse. We don&apos;t do preview.<br />
            We curate one match, once a week.<br />
            That&apos;s the whole point.
          </p>
          <div className="p-4 mb-8 font-typewriter text-sm"
            style={{ background: "var(--bg-dark)", border: "1px solid var(--border)", color: "var(--ink-muted)" }}>
            If you&apos;ve completed your interview, you&apos;re already in the pool.<br />
            Check your dashboard Friday morning.
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/dashboard" className="btn-primary">◆ My Dashboard</Link>
            <Link href="/" className="btn-secondary">← Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
