import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLANS } from "../src/lib/plans";

/**
 * Idempotent seed: plan catalog only.
 *
 * Settings deliberately are not seeded — `src/lib/settings.ts` supplies the
 * defaults and only writes a row when an admin overrides one, so an unseeded
 * database and a fresh one behave identically.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const db = new PrismaClient({ adapter });

async function main() {
  for (const plan of PLANS) {
    const row = {
      name: plan.name,
      description: plan.description,
      priceMinorInr: plan.priceMinorInr,
      priceMinorUsd: plan.priceMinorUsd,
      monthlyCredits: plan.monthlyCredits,
      maxConcurrent: plan.maxConcurrent,
      maxDurationSec: plan.maxDurationSec,
      allowFinal: plan.allowFinal,
      sortOrder: plan.sortOrder,
      active: true,
    };

    await db.plan.upsert({
      where: { code: plan.code },
      create: { code: plan.code, ...row },
      update: row,
    });
  }

  console.log(`Seeded ${PLANS.length} plans.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
