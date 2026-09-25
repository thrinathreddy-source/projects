-- The third moderation outcome: render it, and have a person look afterwards.
-- Allow/refuse is a binary, and plenty of prompts on a product about religion
-- are neither clearly fine nor clearly forbidden.
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'CLEARED', 'REMOVED');

CREATE TABLE "review_item" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "projectId"  TEXT,
    "reason"     TEXT NOT NULL,
    "excerpt"    TEXT NOT NULL,
    "status"     "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note"       TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_item_status_createdAt_idx" ON "review_item"("status", "createdAt");
CREATE INDEX "review_item_userId_idx" ON "review_item"("userId");

ALTER TABLE "review_item" ADD CONSTRAINT "review_item_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: a project removed after review should leave the
-- decision behind, or the audit trail deletes itself.
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
