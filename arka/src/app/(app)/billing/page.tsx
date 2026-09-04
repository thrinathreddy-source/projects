import type { Metadata } from "next";
import { format } from "date-fns";
import { PageBody, PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { PurchaseOptions } from "@/components/billing/purchase-options";
import { CancelSubscription } from "@/components/billing/cancel-subscription";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUserPage } from "@/lib/session";
import { getBalance, history } from "@/lib/credits";
import { billingOverview } from "@/lib/billing";
import { planFor } from "@/lib/projects";
import { paymentsConfigured } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { currencyForCountry, formatCredits, formatMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const LEDGER_LABELS: Record<string, string> = {
  SIGNUP_GRANT: "Welcome credits",
  PLAN_RENEWAL: "Plan renewal",
  PACK_PURCHASE: "Credit pack",
  GENERATION_HOLD: "Generation",
  GENERATION_REFUND: "Refund",
  ADMIN_GRANT: "Adjustment",
  ADMIN_DEDUCT: "Adjustment",
  PROMO: "Promotion",
};

export default async function BillingPage() {
  const user = await requireUserPage("/billing");

  const [balance, plan, overview, ledger, settings, subscribable] = await Promise.all([
    getBalance(user.id),
    planFor(user.planCode),
    billingOverview(user.id),
    history(user.id, 25),
    getSettings(),
    db.plan.findMany({
      where: { active: true, providerPlanId: { not: null } },
      select: { code: true },
    }),
  ]);

  const currency = currencyForCountry(user.country);
  const billingEnabled = settings["flags.billingEnabled"] && paymentsConfigured();

  return (
    <>
      <PageHeader
        title="Billing"
        description="Credits, plans and receipts."
      />

      <PageBody className="max-w-5xl space-y-10">
        {!paymentsConfigured() ? (
          <Alert>
            <AlertDescription>
              Payments are not connected yet. Add your Razorpay keys to
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">.env</code>
              to open checkout.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Credits available"
            value={formatCredits(balance.credits)}
            hint={
              balance.creditsHeld > 0
                ? `${formatCredits(balance.creditsHeld)} reserved by renders`
                : "Never expire"
            }
            accent={balance.credits < 20}
          />
          <StatTile label="Plan" value={plan.name} hint={plan.description} />
          <StatTile
            label="Renews"
            value={
              overview.subscription?.currentPeriodEnd
                ? format(overview.subscription.currentPeriodEnd, "d MMM yyyy")
                : "—"
            }
            hint={
              overview.subscription?.cancelAtPeriodEnd
                ? "Cancels at period end"
                : overview.subscription
                  ? "Monthly"
                  : "No subscription"
            }
          />
        </div>

        <PurchaseOptions
          user={{ name: user.name, email: user.email }}
          currency={currency}
          currentPlan={user.planCode}
          subscribablePlans={subscribable.map((row) => row.code)}
          billingEnabled={billingEnabled}
        />

        {overview.subscription && !overview.subscription.cancelAtPeriodEnd ? (
          <CancelSubscription planName={plan.name} />
        ) : null}

        <section className="space-y-3">
          <h2 className="section-label">Credit activity</h2>

          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">
                        {format(entry.createdAt, "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell>
                        {LEDGER_LABELS[entry.reason] ?? entry.reason}
                        {entry.note ? (
                          <span className="text-muted-foreground"> · {entry.note}</span>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          entry.delta > 0 ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {entry.delta > 0 ? "+" : ""}
                        {formatCredits(entry.delta)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCredits(entry.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="section-label">Payments</h2>

          {overview.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="text-muted-foreground">
                        {format(transaction.createdAt, "d MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        {transaction.purpose === "SUBSCRIPTION"
                          ? `${transaction.planCode ?? "Plan"} subscription`
                          : `${formatCredits(transaction.creditsGranted)} credits`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={transaction.status === "PAID" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(
                          transaction.amountMinor,
                          transaction.currency === "USD" ? "USD" : "INR",
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
