import Link from "next/link";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/money";

/**
 * Balance, always visible.
 *
 * Credits are the product's unit of value, so hiding them behind a page visit
 * would be a mistake — people should always know what a click will cost them.
 */
export function CreditsBadge({
  credits,
  held,
  className,
}: {
  credits: number;
  held: number;
  className?: string;
}) {
  const low = credits < 20;

  return (
    <Link
      href="/billing"
      title={
        held > 0
          ? `${formatCredits(held)} credits reserved by renders in progress`
          : "Buy more credits"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
        low
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Coins className="size-3.5" />
      {formatCredits(credits)}
      {held > 0 ? (
        <span className="text-muted-foreground/70">· {formatCredits(held)} held</span>
      ) : null}
    </Link>
  );
}
