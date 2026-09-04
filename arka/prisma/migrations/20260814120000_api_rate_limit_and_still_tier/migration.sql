-- Fixed-window rate limit counters for Arka's own endpoints.
CREATE TABLE "api_rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_rate_limit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "api_rate_limit_windowStart_idx" ON "api_rate_limit"("windowStart");

-- Stills were being recorded as PREVIEW, which made the cheap iteration step
-- and the expensive motion step indistinguishable in the profitability table.
--
-- Added in its own statement and not referenced anywhere else in this
-- migration: Postgres refuses to use a new enum value inside the transaction
-- that created it, and Prisma runs each migration in one.
ALTER TYPE "RenderTier" ADD VALUE IF NOT EXISTS 'STILL' BEFORE 'PREVIEW';
