"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { opportunityPath } from "@/lib/slug";

interface RelatedOpportunity {
  id: string;
  title: string;
  org: string | null;
  audience: string;
}

const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  EARLY_CAREER: "Early Career",
  FOUNDER: "Founder",
  GENERAL: "General",
};

/** The Policy → Opportunities graph edge — real, verified listings related
 * to a Pulse category, crossing from Match into the Opportunities room.
 * Renders nothing at all if there's no genuine match, rather than forcing
 * a stretched one. */
export function RelatedOpportunities({ category }: { category: string }) {
  const [items, setItems] = useState<RelatedOpportunity[] | null>(null);

  useEffect(() => {
    fetch(`/api/pulse/live/related-opportunities?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [category]);

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
      <div className="font-typewriter" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 8 }}>
        ✦ Real opportunities in this space
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((opp) => (
          <Link
            key={opp.id}
            href={opportunityPath(opp)}
            style={{ fontSize: 12.5, color: "var(--saffron)", textDecoration: "none", lineHeight: 1.4 }}
          >
            {opp.title}
            {opp.org && <span style={{ color: "var(--ink-muted)" }}> — {opp.org}</span>}
            <span style={{ color: "var(--ink-muted)" }}> · {AUDIENCE_LABEL[opp.audience] ?? opp.audience}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
