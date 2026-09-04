import { cn } from "@/lib/utils";

/**
 * Indian ornament, drawn rather than photographed.
 *
 * Every motif here is real vocabulary, not decoration invented to look
 * "ethnic": jaali is the perforated lattice of a temple or palace screen,
 * kolam is the dot-and-line floor drawing of the South, the torana is the
 * gateway arch, and the chakra is the wheel. They are SVG so they inherit
 * colour, scale without assets, and cost nothing to ship.
 */

/**
 * Torana — the temple gateway arch.
 *
 * Used to frame a render. This is the signature shape of the product: a
 * generated clip sits inside a doorway rather than a rounded rectangle, which
 * is most of what stops the page reading as a generic AI tool.
 */
export function ToranaFrame({
  children,
  className,
  glow = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[50%] bg-primary/12 blur-3xl"
        />
      ) : null}

      {/* The arch itself, as a clip path applied to the content. */}
      <div className="relative overflow-hidden rounded-t-[999px] rounded-b-2xl border border-gold/25 bg-card shadow-[0_0_0_1px_oklch(0.85_0.13_88/8%),0_24px_60px_-24px_oklch(0_0_0/80%)]">
        {children}
      </div>

      {/* Finial — the little spire that tops a temple gateway. */}
      <div
        aria-hidden
        className="absolute -top-3 left-1/2 -translate-x-1/2"
      >
        <svg viewBox="0 0 24 24" className="size-6 fill-gold/70">
          <path d="M12 0 L14 7 L12 9 L10 7 Z" />
          <circle cx="12" cy="11.5" r="2" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Jaali screen — a repeating perforated lattice, built from interlocking
 * eight-point stars. Sits behind content as texture.
 */
export function JaaliPattern({
  className,
  opacity = 0.14,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id="arka-jaali" width="60" height="60" patternUnits="userSpaceOnUse">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-gold"
          >
            {/* Eight-point star: two squares, one rotated 45°. */}
            <rect x="16" y="16" width="28" height="28" />
            <rect x="16" y="16" width="28" height="28" transform="rotate(45 30 30)" />
            <circle cx="30" cy="30" r="6" />
            {/* Connective arcs, the way a screen's units interlock. */}
            <path d="M0 30 H10 M50 30 H60 M30 0 V10 M30 50 V60" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#arka-jaali)" />
    </svg>
  );
}

/**
 * Kolam rosette — the dot grid with a continuous line looped around it.
 * Used as a section ornament and as a loading indicator.
 */
export function KolamRosette({
  className,
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  const dots: React.ReactNode[] = [];
  for (let ring = 1; ring <= 2; ring += 1) {
    const count = ring * 6;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      dots.push(
        <circle
          key={`${ring}-${index}`}
          cx={50 + Math.cos(angle) * ring * 15}
          cy={50 + Math.sin(angle) * ring * 15}
          r="1.8"
        />,
      );
    }
  }

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn("size-10", spinning && "animate-spin [animation-duration:6s]", className)}
    >
      <g className="fill-gold/70">
        <circle cx="50" cy="50" r="2.4" />
        {dots}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
        {/* The continuous looping line kolams are actually made of. */}
        {Array.from({ length: 6 }).map((_, index) => {
          const angle = (index / 6) * Math.PI * 2;
          return (
            <circle
              key={index}
              cx={50 + Math.cos(angle) * 15}
              cy={50 + Math.sin(angle) * 15}
              r="15"
              opacity="0.55"
            />
          );
        })}
      </g>
    </svg>
  );
}

/** A gold hairline with a diamond at its centre — section divider. */
export function OrnamentRule({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-hidden>
      <span className="rule-gold h-px flex-1 rotate-180" />
      <svg viewBox="0 0 12 12" className="size-2.5 fill-gold/80">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" />
      </svg>
      <span className="rule-gold h-px flex-1" />
    </div>
  );
}

/**
 * The Dharmachakra — Arka's mark.
 *
 * Eight spokes, not twenty-four. That distinction is not stylistic: the
 * twenty-four-spoke Ashoka Chakra is a national emblem whose commercial use is
 * restricted in India under the Emblems and Names Act, 1950. Eight is the
 * Dharmachakra proper, and it is shared iconography — the same wheel is
 * Vishnu's Sudarshana Chakra, the one Krishna raises at Kurukshetra, which is
 * exactly the material this product exists to animate.
 *
 * Drawn rather than traced from an image, so it stays sharp at poster scale,
 * inherits the palette, and costs nothing to ship. `duotone` separates it onto
 * two deliberately off-register plates for the poster surfaces; the flat form
 * is the logo.
 */
const SPOKES = 8;

/**
 * Radii, from the axle outward. Named because the figure is one system: move
 * the rim and the spokes, ornaments, rosettes and finials all have to follow.
 */
const R = {
  axle: 4.5,
  innerRing: 11,
  petalBase: 13,
  petalTip: 29,
  hub: 33,
  spokeStart: 32,
  ornament: 51,
  rimInner: 70,
  rimBand: 77.5,
  rimOuter: 81,
  finialTip: 95,
} as const;

/** Distance from centre -> SVG y, for the upward-pointing member. */
const y = (radius: number) => 100 - radius;

export function Dharmachakra({
  className,
  duotone = false,
}: {
  className?: string;
  duotone?: boolean;
}) {
  const angles = Array.from({ length: SPOKES }, (_, index) => (index / SPOKES) * 360);

  /** A lotus petal: tip outward, shoulders swelling toward the base. */
  const petal = (tip: number, base: number, width: number) =>
    `M 100 ${y(tip)} C ${100 + width} ${y(tip - (tip - base) * 0.42)} ${100 + width} ${y(base + 1)} 100 ${y(base)} ` +
    `C ${100 - width} ${y(base + 1)} ${100 - width} ${y(tip - (tip - base) * 0.42)} 100 ${y(tip)} Z`;

  const petalRing = (count: number, tip: number, base: number, width: number) =>
    Array.from({ length: count }, (_, index) => (
      <path
        key={`${tip}-${index}`}
        d={petal(tip, base, width)}
        transform={`rotate(${(index / count) * 360} 100 100)`}
      />
    ));

  const plate = (
    <g>
      {/* Flame finials, standing clear of the rim at each spoke. */}
      <g fill="currentColor">
        {angles.map((angle) => (
          <path
            key={`finial-${angle}`}
            d={`M 100 ${y(R.finialTip)} Q 104.2 ${y(R.finialTip - 7)} 105.6 ${y(R.rimOuter + 1)} L 94.4 ${y(R.rimOuter + 1)} Q 95.8 ${y(R.finialTip - 7)} 100 ${y(R.finialTip)} Z`}
            transform={`rotate(${angle} 100 100)`}
          />
        ))}
      </g>

      {/* Rim: a broad band with a fine line set inside it. */}
      <circle cx="100" cy="100" r={R.rimBand} fill="none" stroke="currentColor" strokeWidth="7" />
      <circle cx="100" cy="100" r={R.rimInner} fill="none" stroke="currentColor" strokeWidth="2" />

      {/* Spokes: slim bars, with the ornament held clear of the hub so the
          silhouette stays open. Crowding it against the lotus is what turns
          the middle of the wheel into a blob. */}
      <g fill="currentColor">
        {angles.map((angle) => (
          <g key={`spoke-${angle}`} transform={`rotate(${angle} 100 100)`}>
            <rect x="97.7" y={y(R.rimInner)} width="4.6" height={R.rimInner - R.spokeStart} />

            {/* Vajra ornament at mid-spoke: a lobed diamond. */}
            <path
              d={`M 100 ${y(R.ornament + 9)} Q 105.4 ${y(R.ornament + 3)} 105.4 ${y(R.ornament)} Q 105.4 ${y(R.ornament - 3)} 100 ${y(R.ornament - 9)} Q 94.6 ${y(R.ornament - 3)} 94.6 ${y(R.ornament)} Q 94.6 ${y(R.ornament + 3)} 100 ${y(R.ornament + 9)} Z`}
            />
            {/* Collars either side of it. */}
            <rect x="95.6" y={y(R.ornament + 12)} width="8.8" height="2.4" />
            <rect x="95.6" y={y(R.ornament - 10)} width="8.8" height="2.4" />
          </g>
        ))}
      </g>

      {/* Lotus hub: a disc with petals knocked out of it. */}
      <circle cx="100" cy="100" r={R.hub} fill="currentColor" />
      <g fill="var(--background)">{petalRing(16, R.petalTip, R.petalBase, 4.4)}</g>
      <circle cx="100" cy="100" r={R.innerRing} fill="var(--background)" />
      <circle cx="100" cy="100" r={R.innerRing - 2.2} fill="currentColor" />
      <circle cx="100" cy="100" r={R.axle + 1.6} fill="var(--background)" />
      <circle cx="100" cy="100" r={R.axle - 1.5} fill="currentColor" />

      {/* Rosettes seated on the rim band, drawn last so they sit on top of it. */}
      <g>
        {angles.map((angle) => (
          <g key={`rosette-${angle}`} transform={`rotate(${angle} 100 100)`}>
            <circle cx="100" cy={y(R.rimBand)} r="8.4" fill="currentColor" />
            <circle cx="100" cy={y(R.rimBand)} r="5.4" fill="var(--background)" />
            <circle cx="100" cy={y(R.rimBand)} r="2.4" fill="currentColor" />
          </g>
        ))}
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 200 200" aria-hidden className={className}>
      {duotone ? (
        <>
          {/* Cyan plate, off-register by a hair. */}
          <g transform="translate(3 -2)" opacity="0.8" style={{ color: "var(--cyan)" }}>
            {plate}
          </g>
          <g style={{ color: "var(--vermilion)" }}>{plate}</g>
        </>
      ) : (
        plate
      )}
    </svg>
  );
}

/** Lotus — used as a small marker beside numbered steps. */
export function LotusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5", className)}>
      <g className="fill-current">
        <path d="M12 3c1.6 2.2 2.4 4.3 2.4 6.4 0 1.4-.8 2.6-2.4 3.6-1.6-1-2.4-2.2-2.4-3.6C9.6 7.3 10.4 5.2 12 3Z" />
        <path
          d="M12 13c-2.6 0-4.9-1.1-6.6-3.2 2.3-.6 4.4-.2 6.6 1.3 2.2-1.5 4.3-1.9 6.6-1.3C16.9 11.9 14.6 13 12 13Z"
          opacity="0.75"
        />
        <path
          d="M12 15.5c-3.6 0-6.7-1.4-8.8-4 2.7 6 5.8 9 8.8 9s6.1-3 8.8-9c-2.1 2.6-5.2 4-8.8 4Z"
          opacity="0.5"
        />
      </g>
    </svg>
  );
}
