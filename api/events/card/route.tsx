import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/siteUrl";

const CREAM = "#f3e9cf";
const CARD = "#fbf3df";
const SAFFRON = "#a8552e";
const MAROON = "#1f3a5c";
const INK = "#2b2620";
const MUTED = "rgba(43,38,32,0.68)";

function clamp(v: string | null, max: number, fallback = "") {
  if (!v) return fallback;
  return v.slice(0, max);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
}

// Wraps text into at most `maxLines` lines of ~maxCharsPerLine each.
// satori/next-og text nodes never auto-wrap, so long event titles need
// manual line breaks or they run off the edge of the card.
function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = w;
      if (lines.length === maxLines) break;
    } else {
      current = test;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  const consumedWords = lines.join(" ").split(/\s+/).length;
  if (consumedWords < words.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
  }
  return lines;
}

// Generates a 1080x1920 (Instagram Story / WhatsApp Status) "I'm going" card
// for an event RSVP. Additive-only: does not touch RSVP or check-in logic,
// it just renders event details the page already has after a successful RSVP.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = clamp(searchParams.get("slug"), 80);
  const title = clamp(searchParams.get("title"), 70, "An OppIDX event");
  const location = clamp(searchParams.get("location"), 50, "");
  const name = clamp(searchParams.get("name"), 24, "");
  const when = formatWhen(searchParams.get("when") || "");
  const titleLines = wrapLines(title, 32, 2);

  const eventUrl = `${SITE_URL}/events/${slug}`;
  let qr = "";
  try {
    qr = await QRCode.toDataURL(eventUrl, { margin: 1, width: 260, color: { dark: "#2b2620", light: "#fbf3df" } });
  } catch {
    qr = "";
  }

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: CREAM, alignItems: "center", justifyContent: "center", padding: 70 }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: CARD, border: `6px solid ${SAFFRON}`, borderRadius: 14, alignItems: "center", justifyContent: "space-between", padding: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 32, color: SAFFRON, letterSpacing: 6 }}>OPPIDX · EVENTS</div>
            <div style={{ display: "flex", fontSize: 44, color: INK, fontWeight: 700, marginTop: 26 }}>{"I'm going"}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {titleLines.map((line, i) => (
              <div key={i} style={{ display: "flex", fontSize: 38, color: MAROON, fontWeight: 700, marginBottom: i === titleLines.length - 1 ? 20 : 4 }}>
                {line}
              </div>
            ))}
            {when ? <div style={{ display: "flex", fontSize: 24, color: INK, marginBottom: 8 }}>{when}</div> : null}
            {location ? <div style={{ display: "flex", fontSize: 22, color: MUTED }}>{location}</div> : null}
            {name ? <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 20 }}>{`RSVP'd by ${name}`}</div> : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr ? <img src={qr} alt="" width={200} height={200} style={{ marginBottom: 16 }} /> : null}
            <div style={{ display: "flex", fontSize: 20, color: MAROON, letterSpacing: 2 }}>{`oppidx.com/events/${slug}`}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}
