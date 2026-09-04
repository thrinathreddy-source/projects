"use client";

import { Check, Loader2 } from "lucide-react";
import { useCheckout } from "@/components/billing/use-checkout";
import { CREDIT_PACKS, PLANS } from "@/lib/plans";
import { formatCredits, formatMinor, priceForCurrency, type Currency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PurchaseOptions({
  user,
  currency,
  currentPlan,
  subscribablePlans,
  billingEnabled,
}: {
  user: { name: string; email: string };
  currency: Currency;
  currentPlan: string;
  /** Plan codes with a provider plan id configured; others cannot be bought. */
  subscribablePlans: string[];
  billingEnabled: boolean;
}) {
  const { start, pending } = useCheckout(user);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Monthly credits, renewed automatically. Cancel any time.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const current = plan.code === currentPlan;
            const buyable =
              billingEnabled && plan.code !== "free" && subscribablePlans.includes(plan.code);

            return (
              <div
                key={plan.code}
                className={cn(
                  "flex flex-col rounded-lg border p-4",
                  current ? "border-primary bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{plan.name}</h3>
                  {current ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Current
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {plan.priceMinorInr === 0
                    ? "Free"
                    : formatMinor(priceForCurrency(plan, currency), currency)}
                  {plan.priceMinorInr > 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  ) : null}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>

                <ul className="mt-4 flex-1 space-y-1.5">
                  {plan.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-2 text-xs">
                      <Check className="mt-0.5 size-3 shrink-0 text-success" />
                      <span className="text-muted-foreground">{highlight}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-4">
                  {current ? (
                    <Button variant="outline" className="w-full" disabled>
                      Your plan
                    </Button>
                  ) : plan.code === "free" ? (
                    <Button variant="ghost" className="w-full" disabled>
                      Default
                    </Button>
                  ) : buyable ? (
                    <Button
                      className="w-full"
                      disabled={pending !== null}
                      onClick={() =>
                        start({ kind: "plan", planCode: plan.code }, plan.name)
                      }
                    >
                      {pending === plan.code ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Choose {plan.name}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                      title="Subscriptions for this tier are not switched on yet."
                    >
                      Coming soon
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Credit packs</h2>
          <p className="text-sm text-muted-foreground">
            One-off top-ups. They never expire and stack with your plan.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{pack.name}</h3>
                {pack.badge ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {pack.badge}
                  </Badge>
                ) : null}
              </div>

              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                {formatCredits(pack.credits)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  credits
                </span>
              </p>

              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {formatMinor(priceForCurrency(pack, currency), currency)}
              </p>

              <div className="pt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!billingEnabled || pending !== null}
                  onClick={() => start({ kind: "pack", packId: pack.id }, pack.name)}
                >
                  {pending === pack.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Buy
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
