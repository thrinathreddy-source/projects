import { ImageResponse } from "next/og";

// Social preview card. Shown whenever a link to the site is shared on
// WhatsApp, Instagram, X, iMessage, Slack — previously these rendered blank.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The Mayatara — one honest match, every Friday";

const CREAM   = "#F2E4C4";
const CARD    = "#FAF0D7";
const SAFFRON = "#D4600A";
const MAROON  = "#8B1A1A";
const INK     = "#2C1810";
const MUTED   = "#6B4C35";
const BORDER  = "#C4A45A";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: CREAM, fontFamily: "monospace", padding: 56,
        }}
      >
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between",
            background: CARD, border: `4px solid ${BORDER}`, padding: "52px 60px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* ASCII only: ImageResponse tries to fetch a dynamic font for
                glyphs like ◆ and renders a blank box when that request fails. */}
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 8, color: MAROON }}>
              FOR THE REAL ONES
            </div>
            <div style={{ display: "flex", fontSize: 92, color: INK, letterSpacing: 4, marginTop: 26, lineHeight: 1.05 }}>
              THE MAYATARA
            </div>
            <div style={{ display: "flex", fontSize: 44, color: SAFFRON, letterSpacing: 2, marginTop: 14 }}>
              Find your person. Every Friday.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 27, color: MUTED, lineHeight: 1.5 }}>
              Five honest questions. One match a week. No swiping, no scrolling.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: INK }}>
                themayatara.com
              </div>
              <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: MUTED }}>
                MADE IN INDIA
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
