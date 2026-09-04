-- Addresses collected by the holding page. Unique on email so a double submit
-- is idempotent rather than a duplicate row.
CREATE TABLE "waitlist_entry" (
    "id"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "source"     TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entry_email_key" ON "waitlist_entry"("email");
CREATE INDEX "waitlist_entry_createdAt_idx" ON "waitlist_entry"("createdAt");
