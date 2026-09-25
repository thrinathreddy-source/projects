-- CreateEnum
CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "grievance" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contentUrl" TEXT,
    "userId" TEXT,
    "ipHash" TEXT,
    "status" "GrievanceStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "eraseOnClose" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grievance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grievance_reference_key" ON "grievance"("reference");

-- CreateIndex
CREATE INDEX "grievance_status_dueAt_idx" ON "grievance"("status", "dueAt");

-- CreateIndex
CREATE INDEX "grievance_userId_idx" ON "grievance"("userId");

-- AddForeignKey
ALTER TABLE "grievance" ADD CONSTRAINT "grievance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
