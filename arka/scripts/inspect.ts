import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** Ad-hoc dev inspection: `npx tsx scripts/inspect.ts`. */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

async function main() {
  const users = await db.user.findMany({
    select: { email: true, role: true, credits: true, creditsHeld: true, planCode: true },
  });
  console.log("users:", users);

  const projects = await db.project.findMany({
    select: { id: true, title: true, status: true, progress: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("projects:", projects);

  const jobs = await db.job.findMany({
    select: {
      status: true,
      attempts: true,
      creditsHeld: true,
      providerName: true,
      estimatedCostUsdMicro: true,
      lastError: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("jobs:", jobs);

  const ledger = await db.creditLedger.findMany({
    select: { delta: true, balanceAfter: true, reason: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("ledger:", ledger);

  const generations = await db.generation.findMany({
    select: {
      provider: true,
      model: true,
      tier: true,
      creditsCharged: true,
      costUsdMicro: true,
      latencyMs: true,
      success: true,
      cacheHit: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("generations:", generations);

  const videos = await db.video.findMany({
    select: { tier: true, status: true, storageKey: true, sizeBytes: true },
  });
  console.log("videos:", videos);

  console.log("spend:", await db.dailySpend.findMany());
  console.log("cache:", await db.renderCache.count());
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
