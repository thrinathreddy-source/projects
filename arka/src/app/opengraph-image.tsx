import { ImageResponse } from "next/og";

/**
 * The share card.
 *
 * This is the most-seen surface the product has. An Arka link pasted into
 * WhatsApp — which is the distribution channel for the people this is built
 * for — was rendering as a bare grey rectangle, because `openGraph` in the root
 * layout declared a title and a description and no image at all.
 *
 * Drawn rather than photographed, in the same press palette as the site: four
 * inks on black, the chakra as the mark, a torana arch framing the whole thing.
 * No custom font is loaded on purpose — pulling a webfont at build time makes a
 * deploy depend on Google being reachable, and a card that always renders beats
 * a slightly more on-brand one that can fail a build.
 */

export const alt = "Arka — turn a line of text into a short anime-style video";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The press palette, resolved from the oklch tokens in `globals.css`. Satori
// does not understand oklch, so these are the sRGB equivalents.
const INK = "#0a0504";
const BONE = "#f0e9d9";
const VERMILION = "#f43c14";
const SAFFRON = "#ffa332";
const CYAN = "#00d5e2";
const MUTED = "#a79c92";

/** The Dharmachakra, at share-card scale. */
function Chakra({ size: diameter, color }: { size: number; color: string }) {
  const centre = diameter / 2;
  const outer = centre - 3;
  const hub = diameter * 0.11;

  return (
    <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
      <circle
        cx={centre}
        cy={centre}
        r={outer}
        fill="none"
        stroke={color}
        strokeWidth={diameter * 0.045}
      />
      <circle cx={centre} cy={centre} r={hub} fill={color} />
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * Math.PI) / 6;
        return (
          <line
            key={index}
            x1={centre + Math.cos(angle) * hub}
            y1={centre + Math.sin(angle) * hub}
            x2={centre + Math.cos(angle) * outer}
            y2={centre + Math.sin(angle) * outer}
            stroke={color}
            strokeWidth={diameter * 0.022}
          />
        );
      })}
    </svg>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: "64px 72px",
          position: "relative",
        }}
      >
        {/* The sun, which is what "arka" means. Satori has no blur filter, so
            this is a hard disc rather than the site's soft bleed — at this
            scale the harder edge reads as a printed spot colour, which is the
            register the rest of the brand is in anyway. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: VERMILION,
            opacity: 0.18,
            display: "flex",
          }}
        />

        {/* Rule across the top, as on a printed sheet. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            display: "flex",
          }}
        >
          <div style={{ flex: 3, background: VERMILION }} />
          <div style={{ flex: 1, background: SAFFRON }} />
          <div style={{ flex: 1, background: CYAN }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Chakra size={64} color={SAFFRON} />
          <div
            style={{
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: "0.24em",
              color: BONE,
              textTransform: "uppercase",
            }}
          >
            Arka
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: BONE,
              maxWidth: 940,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Indian stories,</span>
            <span style={{ color: VERMILION }}>anime style.</span>
          </div>

          <div style={{ fontSize: 34, color: MUTED, maxWidth: 860, lineHeight: 1.35 }}>
            Turn a line of text into a short anime-style video.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 26,
            color: MUTED,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: SAFFRON }}>12 languages</span>
          <span style={{ color: "#3a2c26" }}>/</span>
          <span>Vertical first</span>
          <span style={{ color: "#3a2c26" }}>/</span>
          <span>Priced in rupees</span>
        </div>
      </div>
    ),
    size,
  );
}
