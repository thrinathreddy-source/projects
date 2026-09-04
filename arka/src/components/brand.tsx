import Link from "next/link";
import { cn } from "@/lib/utils";
import { Dharmachakra } from "@/components/motifs";

/**
 * The Arka mark.
 *
 * One drawing, everywhere. There is no reduced logo variant: a nav mark that is
 * a different figure from the one filling the hero is two marks, and the eye
 * notices even when it cannot say why. `Dharmachakra` scales down honestly
 * because every part of it is stroked rather than hairline-detailed.
 */
export function ArkaMark({ className }: { className?: string }) {
  return <Dharmachakra className={cn("size-7 text-primary", className)} />;
}

/**
 * The lockup.
 *
 * Set in the poster face, uppercase — the site's whole voice is ultra-condensed
 * caps, and a wordmark in the body sans is the one place that voice would break.
 * Condensed caps need a little tracking back at small sizes or the counters
 * close up, hence the positive letter-spacing that the poster headlines do not
 * have.
 */
export function Wordmark({
  className,
  href = "/",
  size = "default",
}: {
  className?: string;
  href?: string | null;
  size?: "default" | "lg";
}) {
  const large = size === "lg";

  const content = (
    <span className={cn("flex items-center", large ? "gap-3" : "gap-2.5", className)}>
      <ArkaMark className={large ? "size-10" : "size-7"} />

      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "poster text-foreground",
            large ? "text-4xl tracking-[0.015em]" : "text-2xl tracking-[0.025em]",
          )}
        >
          Arka
        </span>
        {large ? (
          <span lang="hi" className="mt-1 text-sm text-primary/70">
            अर्क
          </span>
        ) : null}
      </span>
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="transition-opacity hover:opacity-75">
      {content}
    </Link>
  );
}
