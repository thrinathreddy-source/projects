import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { CREDIT_PACKS, PLANS } from "@/lib/plans";
import { formatCredits, formatMinor } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { PricingTable } from "@/components/pricing-table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Credits, not promises. Plans from ₹399/month for Indian creators, billed in rupees.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const settings = await getSettings();

  const previewPerSecond = settings["credits.previewPerSecond"];
  const finalPerSecond = settings["credits.finalPerSecond"];

  // Passed to the table so every figure there is derived from what we bill.
  const rates = {
    still: settings["credits.stillCharge"],
    previewPerSecond,
    voiceSurcharge: settings["credits.voiceSurcharge"],
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <div className="max-w-2xl">
        <h1 className="page-title text-4xl md:text-5xl">
          Pricing
        </h1>
        <p className="mt-3 text-muted-foreground">
          Every render costs credits, and you see the cost before you click
          Generate. Credits never expire. There is no unlimited plan — a promise
          nobody in this business can keep honestly.
        </p>
      </div>

      {/* At-a-glance comparison, before the cards ------------------------------ */}
      <section className="mt-10">
        <PricingTable rates={rates} />
        <p className="mt-3 text-xs text-muted-foreground">
          Clip counts are worked out from the real credit cost of a render, including
          a couple of draft stills per clip. Spend your credits differently and you
          will get different numbers — nothing here is a cap on what you can make.
        </p>
      </section>

      {/* Plans ---------------------------------------------------------------- */}
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const featured = plan.code === "creator";

          return (
            <div
              key={plan.code}
              className={cn(
                "flex flex-col rounded-xl border p-5",
                featured ? "border-primary bg-primary/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{plan.name}</h2>
                {featured ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Most popular
                  </Badge>
                ) : null}
              </div>

              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                {plan.priceMinorInr === 0 ? (
                  "Free"
                ) : (
                  <>
                    {formatMinor(plan.priceMinorInr, "INR")}
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </>
                )}
              </p>
              {plan.priceMinorUsd > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatMinor(plan.priceMinorUsd, "USD")}/mo outside India
                </p>
              ) : null}

              <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    <span className="text-muted-foreground">{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-6">
                <ButtonLink
                  href="/sign-up"
                  variant={featured ? "default" : "outline"}
                  size="lg"
                  className="w-full"
                >
                  {plan.code === "free" ? "Start free" : `Choose ${plan.name}`}
                </ButtonLink>
              </div>
            </div>
          );
        })}
      </div>

      {/* Credit packs --------------------------------------------------------- */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight">Top-ups</h2>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Run dry mid-month? Buy credits on their own. They stack with your plan
          and never expire.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {formatCredits(pack.credits)} credits
                </p>
                {pack.badge ? (
                  <p className="text-xs text-muted-foreground">{pack.badge}</p>
                ) : null}
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {formatMinor(pack.priceMinorInr, "INR")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How credits work ----------------------------------------------------- */}
      <section className="mt-16 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight">
          What a clip actually costs
        </h2>

        <dl className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm">Preview render</dt>
            <dd className="text-sm text-muted-foreground tabular-nums">
              {previewPerSecond} credits per second
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm">Full-quality render</dt>
            <dd className="text-sm text-muted-foreground tabular-nums">
              {finalPerSecond} credits per second
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm">A 5-second preview</dt>
            <dd className="text-sm text-muted-foreground tabular-nums">
              {previewPerSecond * 5} credits
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm">A failed render</dt>
            <dd className="text-sm text-success">Refunded in full</dd>
          </div>
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">
          Every generation starts as a cheap preview, so you never pay full rate
          to find out a prompt was wrong. Re-render at full quality only when the
          shot is right.
        </p>
      </section>

      <section className="mt-16 rounded-xl border border-border bg-card px-6 py-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight">
          Start with a couple of clips on us.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          No card, no trial countdown. If Arka is not useful, stop.
        </p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/sign-up" size="lg">
            Create your account
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
