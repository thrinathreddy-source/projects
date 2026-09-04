-- Credits taken back because the money for them was returned. Deliberately not
-- ADMIN_DEDUCT: a refund is not a punitive correction and must reconcile
-- against `transaction` separately.
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'PURCHASE_REVERSAL';

-- Refund bookkeeping. `refundedAt` is the idempotency key for a refund, the
-- same way `fulfilledAt` already is for the payment.
ALTER TABLE "transaction"
  ADD COLUMN "refundedAt"        TIMESTAMP(3),
  ADD COLUMN "refundAmountMinor" INTEGER,
  ADD COLUMN "creditsReversed"   INTEGER,
  ADD COLUMN "refundReason"      TEXT,
  ADD COLUMN "invoiceNumber"     TEXT,
  ADD COLUMN "invoicedAt"        TIMESTAMP(3);

-- GST requires a gapless series, so the number must be unique and permanent.
CREATE UNIQUE INDEX "transaction_invoiceNumber_key" ON "transaction"("invoiceNumber");
