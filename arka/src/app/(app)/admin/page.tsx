import type { Metadata } from "next";
import { PageBody } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { SpendChart } from "@/components/admin/spend-chart";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { overview, providerBreakdown } from "@/lib/admin";
import { formatNumber, formatPercent, formatUsd, formatUsdMicro } from "@/lib/money";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [data, providers] = await Promise.all([overview(30), providerBreakdown(30)]);
  const { economics } = data;

  const profitable = economics.grossProfitPerMinuteUsdMicro >= 0;

  return (
    <PageBody className="space-y-8">
      {/* The headline metric ------------------------------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="section-label">Unit economics · last 30 days</h2>
          <p className="text-sm text-muted-foreground">
            Revenue minus payment fees, provider cost and overhead, per minute of
            finished video. If this is positive, growth is safe.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Gross profit / generated minute"
            value={formatUsdMicro(economics.grossProfitPerMinuteUsdMicro, 3)}
            hint={
              economics.minutesGenerated > 0
                ? `over ${economics.minutesGenerated.toFixed(1)} minutes`
                : "no output yet"
            }
            accent={!profitable}
          />
          <StatTile
            label="Revenue"
            value={formatUsd(economics.revenueUsdMicro)}
            hint={`less ${formatUsd(economics.paymentFeesUsdMicro)} in fees`}
          />
          <StatTile
            label="Provider cost"
            value={formatUsd(economics.providerCostUsdMicro)}
            hint={`plus ${formatUsd(economics.overheadUsdMicro)} overhead`}
          />
          <StatTile
            label="Gross margin"
            value={
              economics.grossMargin === null
                ? "—"
                : formatPercent(economics.grossMargin, 0)
            }
            hint={
              economics.grossMargin === null
                ? "no revenue yet"
                : formatUsd(economics.grossProfitUsdMicro)
            }
          />
        </div>
      </section>

      {/* Volume ------------------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Users"
          value={formatNumber(data.users.total)}
          hint={`${formatNumber(data.users.new)} new · ${formatNumber(data.users.paying)} paying`}
        />
        <StatTile
          label="Generations"
          value={formatNumber(economics.generations)}
          hint={`${formatPercent(economics.successRate, 0)} succeeded`}
        />
        <StatTile
          label="Cache hits"
          value={formatNumber(economics.cacheHits)}
          hint={`${formatPercent(economics.cacheHitRate, 0)} served free`}
        />
        <StatTile
          label="Queue"
          value={formatNumber(data.queue.queued + data.queue.running)}
          hint={`${data.queue.deferred} deferred · ${data.queue.failedToday} failed today`}
          accent={data.queue.deferred > 0}
        />
      </section>

      {/* Budget ------------------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-label">Daily provider spend</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatUsd(data.budget.spentUsdMicro)} of{" "}
            {formatUsd(data.budget.capUsdMicro)} today
            {data.budget.exhausted ? (
              <Badge variant="destructive" className="ml-2 text-[10px]">
                Cap reached
              </Badge>
            ) : null}
          </p>
        </div>

        <SpendChart
          data={data.spend.map((row) => ({
            day: row.day.toISOString(),
            costUsdMicro: row.costUsdMicro,
          }))}
          capUsdMicro={data.budget.capUsdMicro}
        />
      </section>

      {/* Providers ---------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="section-label">Providers</h2>

        <div className="flex flex-wrap gap-2">
          {data.providers.map((provider) => (
            <div
              key={provider.name}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span
                className={`size-2 rounded-full ${
                  !provider.configured
                    ? "bg-muted-foreground"
                    : provider.healthy
                      ? "bg-success"
                      : "bg-destructive"
                }`}
              />
              <span className="font-medium">{provider.label}</span>
              <span className="text-xs text-muted-foreground">
                {!provider.configured
                  ? "no credentials"
                  : !provider.enabled
                    ? "disabled"
                    : provider.healthy
                      ? "healthy"
                      : `paused · ${provider.consecutiveFailures} failures`}
              </span>
            </div>
          ))}
        </div>

        {providers.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                  <TableHead className="text-right">Seconds</TableHead>
                  <TableHead className="text-right">Cost / sec</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                  <TableHead className="text-right">Avg latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((row) => (
                  <TableRow key={`${row.provider}-${row.model}`}>
                    <TableCell>
                      <span className="font-medium">{row.provider}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {row.model}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.generations)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.failures > 0 ? (
                        <span className="text-destructive">{row.failures}</span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.secondsGenerated)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsdMicro(row.costPerSecondUsdMicro, 4)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(row.costUsdMicro)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.avgLatencyMs > 0
                        ? `${(row.avgLatencyMs / 1000).toFixed(1)}s`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No generations recorded yet.</p>
        )}
      </section>

      {data.openFeedback > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm">
            {formatNumber(data.openFeedback)} piece
            {data.openFeedback === 1 ? "" : "s"} of feedback waiting.
          </p>
          <ButtonLink href="/admin/feedback" variant="outline" size="sm">
            Read it
          </ButtonLink>
        </div>
      ) : null}
    </PageBody>
  );
}
