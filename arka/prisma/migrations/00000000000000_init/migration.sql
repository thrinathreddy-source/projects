-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'STILL_READY', 'READY', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenderTier" AS ENUM ('PREVIEW', 'FINAL');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATE_STILL', 'GENERATE_PREVIEW', 'GENERATE_FINAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('SIGNUP_GRANT', 'PLAN_RENEWAL', 'PACK_PURCHASE', 'GENERATION_HOLD', 'GENERATION_REFUND', 'ADMIN_GRANT', 'ADMIN_DEDUCT', 'PROMO');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionPurpose" AS ENUM ('CREDIT_PACK', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'PENDING');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "country" TEXT NOT NULL DEFAULT 'IN',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "creditsHeld" INTEGER NOT NULL DEFAULT 0,
    "planCode" TEXT NOT NULL DEFAULT 'free',

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "script" TEXT,
    "style" TEXT NOT NULL,
    "setting" TEXT NOT NULL DEFAULT 'dravidian',
    "language" TEXT NOT NULL DEFAULT 'en',
    "voiceId" TEXT NOT NULL DEFAULT 'none',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "durationSec" INTEGER NOT NULL DEFAULT 5,
    "stillKey" TEXT,
    "stillApprovedAt" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tier" "RenderTier" NOT NULL DEFAULT 'PREVIEW',
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "thumbnailKey" TEXT,
    "sizeBytes" INTEGER,
    "audioKey" TEXT,
    "audioMuxed" BOOLEAN NOT NULL DEFAULT false,
    "audioDurationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "providerName" TEXT,
    "providerJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "timeoutSec" INTEGER NOT NULL DEFAULT 600,
    "creditsHeld" INTEGER NOT NULL DEFAULT 0,
    "providerName" TEXT,
    "providerJobId" TEXT,
    "estimatedCostUsdMicro" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "payload" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tier" "RenderTier" NOT NULL DEFAULT 'PREVIEW',
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicro" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorText" TEXT,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_cache" (
    "id" TEXT NOT NULL,
    "paramsHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "audioKey" TEXT,
    "audioMuxed" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "sizeBytes" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "render_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_health" (
    "name" TEXT NOT NULL,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledUntil" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "provider_health_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "LedgerReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purpose" "TransactionPurpose" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "planCode" TEXT,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerRefundId" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "providerSubId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinorInr" INTEGER NOT NULL DEFAULT 0,
    "priceMinorUsd" INTEGER NOT NULL DEFAULT 0,
    "monthlyCredits" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 1,
    "maxDurationSec" INTEGER NOT NULL DEFAULT 5,
    "allowFinal" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "providerPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER,
    "message" TEXT NOT NULL,
    "page" TEXT,
    "meta" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_log" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_spend" (
    "day" DATE NOT NULL,
    "costUsdMicro" INTEGER NOT NULL DEFAULT 0,
    "generations" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_spend_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_createdAt_idx" ON "user"("createdAt");

-- CreateIndex
CREATE INDEX "user_planCode_idx" ON "user"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "project_userId_createdAt_idx" ON "project"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "project_deletedAt_idx" ON "project"("deletedAt");

-- CreateIndex
CREATE INDEX "video_projectId_tier_idx" ON "video"("projectId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "job_idempotencyKey_key" ON "job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "job_status_runAfter_priority_idx" ON "job"("status", "runAfter", "priority" DESC);

-- CreateIndex
CREATE INDEX "job_projectId_idx" ON "job"("projectId");

-- CreateIndex
CREATE INDEX "generation_createdAt_idx" ON "generation"("createdAt");

-- CreateIndex
CREATE INDEX "generation_provider_createdAt_idx" ON "generation"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "generation_userId_createdAt_idx" ON "generation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "generation_success_idx" ON "generation"("success");

-- CreateIndex
CREATE UNIQUE INDEX "render_cache_paramsHash_key" ON "render_cache"("paramsHash");

-- CreateIndex
CREATE INDEX "render_cache_lastUsedAt_idx" ON "render_cache"("lastUsedAt");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_createdAt_idx" ON "credit_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_ledger_refType_refId_idx" ON "credit_ledger"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_providerOrderId_key" ON "transaction"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_providerPaymentId_key" ON "transaction"("providerPaymentId");

-- CreateIndex
CREATE INDEX "transaction_userId_createdAt_idx" ON "transaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transaction_status_createdAt_idx" ON "transaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_providerSubId_key" ON "subscription"("providerSubId");

-- CreateIndex
CREATE INDEX "subscription_userId_idx" ON "subscription"("userId");

-- CreateIndex
CREATE INDEX "subscription_status_currentPeriodEnd_idx" ON "subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_hashedKey_key" ON "api_key"("hashedKey");

-- CreateIndex
CREATE INDEX "api_key_userId_idx" ON "api_key"("userId");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "system_log_createdAt_idx" ON "system_log"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_log_level_createdAt_idx" ON "system_log"("level", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation" ADD CONSTRAINT "generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation" ADD CONSTRAINT "generation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
