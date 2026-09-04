"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PULSE_CATEGORIES } from "@/lib/platform/pulseStats";
import { PulseHeadlineCard, PulseHeadlineGrid } from "@/components/ui/PulseHeadlineCard";
import { RelatedOpportunities } from "@/components/ui/RelatedOpportunities";

interface Headline {
  id: string;
  title: string;
  url: string;
  category: string;
  source: string;
  source_type: "government" | "newspaper";
  fetched_at: string;
}

interface Datapoint {
  category: string;
  label: string;
  value: string;
  unit: string;
  as_of: string;
  source_name: string;
  source_url: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CategoryFilters({ active, onToggle }: { active: string[]; onToggle: (c: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-10">
      {PULSE_CATEGORIES.map((c) => {
        const isActive = active.includes(c.category);
        return (
          <button
            key={c.category}
            onClick={() => onToggle(c.category)}
            className="font-typewriter text-xs tracking-wide px-3 py-1.5"
            style={{
              border: `1px solid ${isActive ? "var(--saffron)" : "var(--border)"}`,
              background: isActive ? "var(--saffron)" : "var(--card)",
              color: isActive ? "var(--bg)" : "var(--ink-muted)",
              cursor: "pointer",
            }}
          >
            {c.sym} {c.category}
          </button>
        );
      })}
    </div>
  );
}

interface ArchivedDigest {
  period: string;
  periodType: string;
  summary: string;
  createdAt: string;
}

/** Past daily/weekly digests, newest first — otherwise the only way to
 * reach one is already knowing its exact date or ISO-week slug. */
function DigestArchive() {
  const [digests, setDigests] = useState<ArchivedDigest[] | null>(null);

  useEffect(() => {
    fetch("/api/pulse/digests")
      .then((r) => r.json())
      .then((data) => setDigests(data.items ?? []))
      .catch(() => setDigests([]));
  }, []);

  if (digests === null || digests.length === 0) return null;

  return (
    <>
      <div className="gem-divider mb-3 text-sm">◆ DIGEST ARCHIVE ◆</div>
      <p className="text-xs text-center mb-6" style={{ color: "var(--ink-muted)" }}>
        Every daily and weekly digest we&apos;ve put out, in one place.
      </p>
      <div className="flex flex-col gap-2 mb-14 max-w-2xl mx-auto">
        {digests.map((d) => (
          <Link
            key={d.period}
            href={`/pulse/digest/${d.period}`}
            className="card px-4 py-3 flex items-center gap-3"
            style={{ textDecoration: "none" }}
          >
            <span
              className="text-xs font-typewriter tracking-wide px-2 py-0.5 flex-none"
              style={{ background: "var(--bg-dark)", color: "var(--saffron)" }}
            >
              {d.periodType === "weekly" ? "WEEK" : "DAY"}
            </span>
            <span className="text-xs font-typewriter flex-none" style={{ color: "var(--ink-muted)" }}>
              {d.period}
            </span>
            <span className="text-sm truncate" style={{ color: "var(--ink)" }}>
              {d.summary}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

function HeadlineGroups({ headlines }: { headlines: Headline[] }) {
  const grouped = PULSE_CATEGORIES
    .map((c) => ({ ...c, items: headlines.filter((h) => h.category === c.category) }))
    .filter((c) => c.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {grouped.map((g) => (
        <div key={g.category}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg" style={{ color: "var(--saffron)" }}>{g.sym}</span>
            <h2 className="font-typewriter text-sm tracking-widest" style={{ color: "var(--ink)" }}>{g.category.toUpperCase()}</h2>
          </div>
          {g.whyItMatters && (
            <p className="text-xs mb-3" style={{ color: "var(--ink-muted)" }}>{g.whyItMatters}</p>
          )}
          <PulseHeadlineGrid>
            {g.items.map((h) => (
              <PulseHeadlineCard
                key={h.url}
                sym={g.sym}
                category={g.category}
                title={h.title}
                source={h.source}
                timeLabel={timeAgo(h.fetched_at)}
                url={h.url}
                headlineId={h.id}
              />
            ))}
          </PulseHeadlineGrid>
          <RelatedOpportunities category={g.category} />
        </div>
      ))}
    </div>
  );
}

export default function PulseClient() {
  const [headlines, setHeadlines] = useState<Headline[] | null>(null);
  const [datapoints, setDatapoints] = useState<Datapoint[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  // The newest digest that actually exists, not today's date. The digest is
  // written by a cron at 15:30 UTC, so linking to today unconditionally sent
  // every visitor before that to a 404 — most of each day, and all day if the
  // cron ever failed. null until known, which also hides the link when there
  // are no digests at all.
  const [latestDigest, setLatestDigest] = useState<string | null>(null);

  function toggleCategory(category: string) {
    setActiveCategories((list) => (list.includes(category) ? list.filter((c) => c !== category) : [...list, category]));
  }

  useEffect(() => {
    fetch("/api/pulse/live/data")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setLoadError(data.error); return; }
        setHeadlines(data.headlines);
        setDatapoints(data.datapoints || []);
        setLastFetched(data.lastFetched);
      })
      .catch(() => setLoadError("Couldn't load today's feed."));
  }, []);

  useEffect(() => {
    fetch("/api/pulse/digests")
      .then((r) => r.json())
      .then((data) => setLatestDigest(data.items?.[0]?.period ?? null))
      .catch(() => setLatestDigest(null));
  }, []);

  const filteredHeadlines = activeCategories.length
    ? (headlines || []).filter((h) => activeCategories.includes(h.category))
    : (headlines || []);
  const government = filteredHeadlines.filter((h) => h.source_type === "government");
  const newspapers = filteredHeadlines.filter((h) => h.source_type === "newspaper");

  return (
    <div className="stamped-scope min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="border-b-2 z-10 relative" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="max-w-4xl mx-auto px-6 py-2.5 text-center">
          <span className="text-xs tracking-widest font-typewriter" style={{ color: "var(--ink-muted)" }}>NO LEFT. NO RIGHT. JUST FORWARD.</span>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-14 relative z-10">

        <div className="text-center mb-12">
          <div className="text-3xl mb-3" style={{ color: "var(--saffron)" }}>◈</div>
          <h1 className="font-typewriter text-3xl md:text-4xl mb-3" style={{ color: "var(--ink)" }}>KNOW THE NUMBERS.</h1>
          <p className="text-sm leading-relaxed max-w-xl mx-auto" style={{ color: "var(--ink-muted)" }}>
            A daily, apolitical read on what the government is doing and what the papers are reporting
            on the economy and development — pulled straight from official and published sources. No opinions, no left vs. right.
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--saffron)" }}>
            {lastFetched ? `Refreshed ${timeAgo(lastFetched)}` : "Refreshing..."}
          </p>
          {latestDigest && (
            <p className="text-xs mt-3">
              <Link href={`/pulse/digest/${latestDigest}`} style={{ color: "var(--ink-muted)", textDecoration: "underline" }}>
                Read the latest policy digest — one link, easy to share →
              </Link>
            </p>
          )}
        </div>

        {headlines && headlines.length > 0 && (
          <CategoryFilters active={activeCategories} onToggle={toggleCategory} />
        )}

        {loadError && (
          <div className="card p-8 text-center mb-10">
            <p className="text-sm" style={{ color: "var(--maroon)" }}>◆ {loadError}</p>
          </div>
        )}

        {headlines === null && !loadError && (
          <div className="font-typewriter text-center animate-pulse" style={{ color: "var(--saffron)" }}>◆ Loading...</div>
        )}

        {/* Verified figures — only shown once real sourced data exists */}
        {datapoints.length > 0 && (
          <>
            <div className="gem-divider mb-3 text-sm">◆ VERIFIED FIGURES ◆</div>
            <div className="flex flex-col gap-4 mb-14">
              {datapoints.map((d) => (
                <div key={`${d.category}-${d.label}`} className="card p-6">
                  <span className="text-xs font-typewriter px-2 py-0.5" style={{ background: "var(--bg-dark)", color: "var(--saffron)" }}>
                    {d.category.toUpperCase()}
                  </span>
                  <h2 className="font-typewriter text-base mt-2 mb-1" style={{ color: "var(--ink)" }}>{d.label}</h2>
                  <div className="font-typewriter text-2xl mb-1" style={{ color: "var(--saffron)" }}>{d.value} <span className="text-sm" style={{ color: "var(--ink-muted)" }}>{d.unit}</span></div>
                  <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    As of {d.as_of} · <a href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--saffron)", textDecoration: "underline" }}>{d.source_name}</a>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* From the papers — the daily-read hook */}
        {newspapers.length > 0 && (
          <>
            <div className="gem-divider mb-3 text-sm">◆ FROM THE PAPERS ◆</div>
            <p className="text-xs text-center mb-8" style={{ color: "var(--ink-muted)" }}>
              Business & economy coverage from The Hindu, The Indian Express, and LiveMint
            </p>
            <div className="mb-14">
              <HeadlineGroups headlines={newspapers} />
            </div>
          </>
        )}

        {/* Government feed */}
        {government.length > 0 && (
          <>
            <div className="gem-divider mb-3 text-sm">◆ TODAY&apos;S POLICY FEED ◆</div>
            <p className="text-xs text-center mb-8" style={{ color: "var(--ink-muted)" }}>
              Straight from official government and regulatory feeds — India&apos;s PIB/RBI/SEBI, the U.S.&apos;s Federal Register/SEC, and the UK&apos;s GOV.UK/FCA/Bank of England, nothing from a news outlet.
            </p>
            <HeadlineGroups headlines={government} />
          </>
        )}

        {headlines && headlines.length === 0 && !loadError && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              First refresh hasn&apos;t run yet. Check back shortly — this updates daily.
            </p>
          </div>
        )}

        {headlines && headlines.length > 0 && filteredHeadlines.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              Nothing in the selected categories today — try clearing a filter.
            </p>
          </div>
        )}

        <DigestArchive />

        <p className="text-xs text-center mt-10 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
          Every headline above links to the original source. No summarising, no AI — a plain keyword
          filter sorts these into categories and screens out anything political, nothing more.
          <br />
          <Link href="/match/terms" style={{ color: "var(--saffron)" }}>Terms & Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
