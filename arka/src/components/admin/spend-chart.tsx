"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { formatUsd } from "@/lib/money";

/** Daily provider spend against the cap. The line is the thing to watch. */
export function SpendChart({
  data,
  capUsdMicro,
}: {
  data: { day: string; costUsdMicro: number }[];
  capUsdMicro: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border">
        <p className="text-sm text-muted-foreground">No provider spend recorded yet.</p>
      </div>
    );
  }

  const points = data.map((row) => ({
    day: row.day,
    usd: row.costUsdMicro / 1_000_000,
  }));

  const cap = capUsdMicro / 1_000_000;
  const peak = Math.max(cap, ...points.map((point) => point.usd));

  return (
    <div className="h-56 w-full rounded-lg border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) => format(new Date(value), "d MMM")}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, Math.ceil(peak * 1.15)]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(value: number) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(label) =>
              typeof label === "string" ? format(new Date(label), "d MMM yyyy") : ""
            }
            formatter={(value) => [
              formatUsd(Number(value ?? 0) * 1_000_000),
              "Spend",
            ]}
          />
          <ReferenceLine
            y={cap}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            label={{
              value: "daily cap",
              position: "insideTopRight",
              fill: "var(--muted-foreground)",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="usd"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#spend)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
