import { availableShowcase, labelsFor } from "@/lib/showcase";

/**
 * The demonstrations plate.
 *
 * This is what replaced the free tier, so it has to carry the persuasion on its
 * own: someone arrives, watches, and decides to pay without ever having spent
 * our money. Each clip shows the prompt that made it, because a showcase that
 * hides its inputs reads as a reel rather than as evidence.
 *
 * Renders nothing at all when no clips are published. A section headed "See
 * what it makes" above eight empty rectangles is worse than no section.
 */
export function Showcase() {
  const items = availableShowcase();
  if (items.length === 0) return null;

  return (
    <section
      id="showcase"
      className="stock-bone grain halftone relative overflow-hidden border-y-2 border-vermilion/40 text-ink"
    >
      <div className="relative z-[2] mx-auto max-w-6xl px-5 py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <h2 className="poster text-[3.5rem] sm:text-[5rem]">
            Made with <span className="text-vermilion">Arka</span>
          </h2>
          <p className="annotation max-w-xs text-ink/70">
            Every clip below, and the exact prompt behind it
          </p>
        </div>

        <div className="grid gap-px border border-ink/15 bg-ink/15 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const labels = labelsFor(item);

            return (
              <figure key={item.slug} className="group relative bg-bone">
                <video
                  /**
                   * Autoplaying muted loops are the format people already read
                   * as "example" — but the poster carries the first paint, so a
                   * slow connection sees the frame rather than a black box, and
                   * preload="none" means an unwatched clip costs nothing.
                   */
                  className="aspect-[9/16] w-full object-cover"
                  poster={`/showcase/${item.slug}.jpg`}
                  preload="none"
                  muted
                  loop
                  playsInline
                  controls
                >
                  <source src={`/showcase/${item.slug}.mp4`} type="video/mp4" />
                </video>

                <figcaption className="space-y-2 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="poster text-2xl">{item.title}</h3>
                    <span className="annotation shrink-0 text-vermilion">
                      {item.durationSec}s
                    </span>
                  </div>

                  <p className="font-mono text-xs leading-relaxed text-ink/70">
                    &ldquo;{item.prompt}&rdquo;
                  </p>

                  <p className="annotation text-ink/50">
                    {labels.setting} · {labels.style}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
