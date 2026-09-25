import { ImageResponse } from "next/og";

const CREAM = "#f3e9cf";
const CARD = "#fbf3df";
const SAFFRON = "#a8552e";
const MAROON = "#1f3a5c";
const INK = "#2b2620";
const MUTED = "rgba(43,38,32,0.68)";
const GREEN = "#2D5016";

function clamp(v: string | null, max: number, fallback = "") {
  if (!v) return fallback;
  return v.slice(0, max);
}

function clampNum(v: string | null, min: number, max: number) {
  const n = parseInt(v || "", 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Generates a 1080x1920 (Instagram Story / WhatsApp Status) shareable card
// for a compatibility result. Additive-only: does not touch matching logic,
// it just renders numbers already computed by /api/compatibility[/global].
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "global" ? "global" : "pair";
  const relationshipType = clamp(searchParams.get("relationshipType"), 24, "a real connection").toUpperCase();

  if (type === "global") {
    const percentile = clampNum(searchParams.get("percentile"), 0, 99);
    const topPct = 100 - percentile;

    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: CREAM, alignItems: "center", justifyContent: "center", padding: 70 }}>
          <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD, border: `6px solid ${MAROON}`, borderRadius: 14, alignItems: "center", justifyContent: "space-between", padding: 64 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 38, color: SAFFRON, letterSpacing: 6 }}>OPPIDX MATCH</div>
              <div style={{ fontSize: 20, color: MUTED, letterSpacing: 3, marginTop: 14 }}>GLOBAL FIT CHECK</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 190, color: SAFFRON, fontWeight: 700 }}>Top {topPct}%</div>
              <div style={{ display: "flex", fontSize: 26, color: INK, marginTop: 16, textAlign: "center" }}>
                stronger fit than {percentile}% of the pool
              </div>
              <div style={{ display: "flex", fontSize: 20, color: MUTED, marginTop: 10 }}>looking for: {relationshipType}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 22, color: MAROON, letterSpacing: 2 }}>oppidx.com/match/compatibility</div>
              <div style={{ fontSize: 16, color: MUTED, marginTop: 6 }}>free · private · no subscription</div>
            </div>
          </div>
        </div>
      ),
      { width: 1080, height: 1920 }
    );
  }

  const score = clampNum(searchParams.get("score"), 0, 100);
  const verdict = clamp(searchParams.get("verdict"), 40, "").toUpperCase();
  const nameA = clamp(searchParams.get("nameA"), 20, "Person A");
  const nameB = clamp(searchParams.get("nameB"), 20, "Person B");
  const scoreColor = score >= 80 ? GREEN : score >= 60 ? SAFFRON : MAROON;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: CREAM, alignItems: "center", justifyContent: "center", padding: 70 }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD, border: `6px solid ${SAFFRON}`, borderRadius: 14, alignItems: "center", justifyContent: "space-between", padding: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 38, color: SAFFRON, letterSpacing: 6 }}>OPPIDX MATCH</div>
            <div style={{ display: "flex", fontSize: 20, color: MUTED, letterSpacing: 3, marginTop: 14 }}>{relationshipType} CHECK</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 30, color: INK, marginBottom: 18 }}>{nameA} · {nameB}</div>
            <div style={{ display: "flex", fontSize: 210, color: scoreColor, fontWeight: 700 }}>{score}</div>
            <div style={{ fontSize: 24, color: MUTED, marginTop: -8 }}>out of 100</div>
            {verdict ? <div style={{ fontSize: 24, color: SAFFRON, marginTop: 22, letterSpacing: 2 }}>{verdict}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 22, color: MAROON, letterSpacing: 2 }}>oppidx.com/match/compatibility</div>
            <div style={{ fontSize: 16, color: MUTED, marginTop: 6 }}>free · private · no subscription</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}
