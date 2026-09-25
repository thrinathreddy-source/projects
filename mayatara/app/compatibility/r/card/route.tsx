import { ImageResponse } from "next/og";
import { parseSharedResult, shortHeadline } from "@/lib/shareResult";
import { SITE_DISPLAY } from "@/lib/seo";

// Link-preview image for a shared result: 1200x630, the ratio WhatsApp,
// iMessage, X and Slack actually render. (The 1080x1920 card under /api is a
// different thing — a Story/Status post, not a link preview.)
//
// This deliberately lives outside /api/, which robots.txt disallows: some
// social crawlers honour robots.txt and would refuse to fetch a preview image
// from a blocked path, leaving shared links with no image at all.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CREAM = "#F2E4C4";
const CARD = "#FAF0D7";
const SAFFRON = "#D4600A";
const MAROON = "#8B1A1A";
const INK = "#2C1810";
const MUTED = "#6B4C35";
const BORDER = "#C4A45A";
const GREEN = "#2D5016";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = parseSharedResult(Object.fromEntries(searchParams.entries()));

  // A malformed link still deserves a preview — falling back to the plain
  // brand card beats a broken image in someone's chat.
  const big = result ? shortHeadline(result) : "The Mayatara";
  const context = result?.lookingFor ? `${result.lookingFor.toUpperCase()} CHECK` : "COMPATIBILITY CHECK";
  const verdict = result?.verdict ?? "";
  const scoreColor = !result
    ? INK
    : result.type === "global"
      ? SAFFRON
      : (result.score ?? 0) >= 80 ? GREEN : (result.score ?? 0) >= 60 ? SAFFRON : MAROON;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: CREAM, fontFamily: "monospace", padding: 48,
        }}
      >
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between",
            background: CARD, border: `4px solid ${BORDER}`, padding: "44px 56px",
          }}
        >
          {/* ASCII only — ImageResponse fetches a dynamic font for glyphs like
              ◆ and renders an empty box when that request fails. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: MAROON }}>
              THE MAYATARA
            </div>
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, color: MUTED, marginTop: 8 }}>
              {context}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 120, color: scoreColor, lineHeight: 1 }}>
              {big}
            </div>
            {verdict ? (
              <div style={{ display: "flex", fontSize: 34, color: SAFFRON, letterSpacing: 2, marginTop: 18 }}>
                {verdict}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: INK }}>
              {`${SITE_DISPLAY}/compatibility`}
            </div>
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: MUTED }}>
              FREE - NO ACCOUNT
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
