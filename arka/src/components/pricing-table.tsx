import { Check, Minus } from "lucide-react";
import { PLANS, planOutcomes, type CreditRates } from "@/lib/plans";
import { formatCredits, formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The comparison table.
 *
 * Every quantity is computed from the plan definition and the live credit
 * rates, never written by hand. That is not tidiness — the hand-written version
 * of this page claimed Creator was "about 90 clips" when it is four, because
 * whoever wrote it guessed at ten credits a clip and nothing ever checked. A
 * derived table cannot be wrong by 20x, and cannot silently rot when a rate
 * changes in admin.
 *
 * Rows state outcomes rather than credits. A credit is our unit of account; a
 * buyer wants to know whether this covers their week.
 */

type Row = {
  label: string;
  /** Rendered per plan. Strings are shown as-is; booleans become tick or dash. */
  value: (plan: (typeof PLANS)[number], rates: CreditRates) => string | boolean;
  note?: string;
};

const ROWS: Row[] = [
  {
    label: "Animation",
    note: "At the plan's longest clip, allowing a couple of drafts each",
    value: (plan, rates) => {
      const out = planOutcomes(plan, rates);
      if (out.clips === 0) return false;
      return `~${out.clips} clip${out.clips === 1 ? "" : "s"} of ${out.clipSeconds}s`;
    },
  },
  {
    label: "…or stills only",
    note: "If you spend the whole allowance drawing instead",
    value: (plan, rates) => {
      const out = planOutcomes(plan, rates);
      return out.stills > 0 ? `~${out.stills} stills` : false;
    },
  },
  {
    label: "Longest clip",
    value: (plan) => `${plan.maxDurationSec} seconds`,
  },
  {
    label: "Credits included",
    value: (plan) =>
      plan.monthlyCredits > 0 ? `${formatCredits(plan.monthlyCredits)} / month` : false,
  },
  {
    label: "Master quality",
    note: "A second, higher-fidelity pass once you like the preview",
    value: (plan) => plan.allowFinal,
  },
  {
    label: "Renders at once",
    value: (plan) => `${plan.maxConcurrent}`,
  },
  {
    label: "Queue priority",
    value: (plan) =>
      plan.code === "free" ? false : plan.sortOrder >= 3 ? "Highest" : plan.sortOrder >= 2 ? "High" : "Standard",
  },
  {
    label: "Commercial use",
    value: (plan) => plan.monthlyCredits > 0 || plan.code !== "free",
  },
  {
    label: "HTTP API",
    value: (plan) => plan.allowApi,
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-success" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="Not included" />;
  return <span className="tabular-nums">{value}</span>;
}

export function PricingTable({ rates }: { rates: CreditRates }) {
  return (
    // Wide tables must scroll inside their own box, never the page.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-56 border-b border-border p-3 text-left font-normal text-muted-foreground">
              What you get
            </th>
            {PLANS.map((plan) => (
              <th
                key={plan.code}
                className={cn(
                  "border-b border-border p-3 text-center",
                  plan.code === "creator" && "bg-primary/5",
                )}
              >
                <span className="block font-medium">{plan.name}</span>
                <span className="mt-1 block text-lg font-semibold tabular-nums">
                  {plan.priceMinorInr === 0 ? "Free" : formatMinor(plan.priceMinorInr, "INR")}
                </span>
                {plan.priceMinorInr > 0 ? (
                  <span className="text-xs font-normal text-muted-foreground">/month</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="border-b border-border p-3 text-left font-normal">
                <span className="block">{row.label}</span>
                {row.note ? (
                  <span className="block text-xs text-muted-foreground">{row.note}</span>
                ) : null}
              </th>

              {PLANS.map((plan) => (
                <td
                  key={plan.code}
                  className={cn(
                    "border-b border-border p-3 text-center",
                    plan.code === "creator" && "bg-primary/5",
                  )}
                >
                  <Cell value={row.value(plan, rates)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
