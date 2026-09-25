import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { COGS, usdMicroToInr } from "../src/lib/economics";

/**
 * Compare what we estimated against what we were actually charged —
 * `npm run reconcile`.
 *
 * Every provider call writes a `generation` row carrying the cost the vendor
 * reported. This reads them back per model and prints the constant to change in
 * `src/lib/economics.ts`. Trueing up the model then stops being a manual
 * exercise in reading invoices and becomes a diff.
 *
 * Under-estimating is the dangerous direction: the daily budget guard charges
 * against these numbers, so a low estimate means real spend can drift past a cap
 * that looks like it is holding.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

const rs = (n: number) => `Rs.${n.toFixed(2)}`;

async function main() {
  const rows = await db.generation.groupBy({
    by: ["provider", "model", "tier"],
    where: { success: true, cacheHit: false, costUsdMicro: { gt: 0 } },
    _count: { _all: true },
    _sum: { costUsdMicro: true, durationSec: true },
  });

  if (rows.length === 0) {
    console.log(
      "\n  No billed generations recorded yet.\n\n" +
        "  This becomes useful after real renders — mock providers report zero\n" +
        "  cost, so there is nothing to reconcile until FAL_KEY is live.\n",
    );
    return;
  }

  console.log("\n  Actual cost per model, from recorded generations:\n");
  console.log("  model                                   runs      actual   estimate   delta");

  for (const row of rows) {
    const runs = row._count._all;
    const totalUsdMicro = row._sum.costUsdMicro ?? 0;
    const seconds = row._sum.durationSec ?? 0;

    // Stills are billed per image; motion per second of output.
    const perUnit = row.tier === "PREVIEW" || row.tier === "FINAL"
      ? seconds > 0
        ? totalUsdMicro / seconds
        : totalUsdMicro / runs
      : totalUsdMicro / runs;

    const estimate =
      row.tier === "FINAL"
        ? COGS.motionFinalUsdMicroPerSec
        : row.tier === "PREVIEW"
          ? COGS.motionPreviewUsdMicroPerSec
          : COGS.stillUsdMicro;

    const delta = perUnit - estimate;
    const flag = delta > estimate * 0.1 ? "  UNDER-ESTIMATED" : "";

    console.log(
      `  ${row.model.slice(0, 38).padEnd(38)} ${String(runs).padStart(5)}` +
        ` ${String(Math.round(perUnit)).padStart(11)} ${String(estimate).padStart(10)}` +
        ` ${(delta >= 0 ? "+" : "") + Math.round(delta)}${flag}`,
    );
  }

  const total = rows.reduce((sum, r) => sum + (r._sum.costUsdMicro ?? 0), 0);
  console.log(
    `\n  Total billed so far  $${(total / 1_000_000).toFixed(3)}  (${rs(usdMicroToInr(total))})`,
  );
  console.log(
    "\n  Units are USD micros. Copy any changed figure into COGS in\n" +
      "  src/lib/economics.ts and the matching spec in src/lib/providers/,\n" +
      "  then re-run `npm run economics` to see whether margin still holds.\n",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
