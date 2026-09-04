import type { Transaction } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { COMPANY, registeredAddressLine } from "@/lib/company";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GST invoices.
 *
 * A `transaction` row is a record that money moved. It is not a tax invoice,
 * and in India a business collecting GST has to issue one: supplier GSTIN,
 * SAC code, place of supply, the tax split, and a **gapless sequential number**
 * per financial year. "Gapless" is the constraint that shapes this file — a
 * number may not be reused, reassigned, or skipped, so it is allocated once at
 * fulfilment and then frozen.
 *
 * Prices are GST-inclusive at checkout, because a customer who sees ₹499 should
 * pay ₹499. That makes the tax a back-calculation out of the total rather than
 * an addition to it, which is the part most implementations get backwards.
 *
 * Intra-state supply splits into CGST + SGST; anything else is IGST. The
 * comparison is the customer's state against the company's state of
 * registration — and since Arka does not collect a customer address, everything
 * is treated as inter-state unless the customer is unregistered and in the home
 * state, which we cannot know. See `placeOfSupply` below.
 */

export type TaxSplit = {
  /** Total charged, inclusive of tax. Minor units. */
  grossMinor: number;
  /** Ex-tax value of the supply. */
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalTaxMinor: number;
  ratePercent: number;
};

/**
 * Back out the tax from a GST-inclusive total.
 *
 * Rounding is done once, on the taxable value, and the tax is the remainder.
 * Computing both independently and rounding each is how an invoice ends up a
 * paisa short of its own total.
 */
export function splitTax(grossMinor: number, intraState: boolean): TaxSplit {
  const rate = COMPANY.tax.gstRatePercent;
  const taxableMinor = Math.round((grossMinor * 100) / (100 + rate));
  const totalTaxMinor = grossMinor - taxableMinor;

  // The half-split has to add back to the total exactly, so one half absorbs
  // the odd paisa rather than both being rounded independently.
  const half = Math.floor(totalTaxMinor / 2);

  return {
    grossMinor,
    taxableMinor,
    cgstMinor: intraState ? half : 0,
    sgstMinor: intraState ? totalTaxMinor - half : 0,
    igstMinor: intraState ? 0 : totalTaxMinor,
    totalTaxMinor,
    ratePercent: rate,
  };
}

/**
 * Indian financial year for a date: April to March, written "2026-27".
 *
 * The invoice series restarts each one, which is why the year is part of the
 * number rather than a column.
 */
export function financialYear(date: Date): string {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Allocate the next invoice number in this financial year's series.
 *
 * Serialisable, because "next in a gapless sequence" is precisely the read that
 * cannot tolerate a concurrent one — two payments fulfilled in the same instant
 * would otherwise both read the same maximum and claim the same number, and the
 * unique index would then reject one *after* its payment had been fulfilled.
 */
export async function allocateInvoiceNumber(transactionId: string): Promise<string> {
  const issuedAt = new Date();
  const year = financialYear(issuedAt);
  const prefix = `${COMPANY.tax.invoicePrefix}/${year}/`;

  return db.$transaction(
    async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: { invoiceNumber: true },
      });

      // Already numbered — hand back the same one. An invoice number is issued
      // once and never changes, whatever redelivery does.
      if (existing?.invoiceNumber) return existing.invoiceNumber;

      /**
       * Order by the sequence as a number, not as text.
       *
       * Zero padding makes string ordering agree with numeric ordering only
       * while the width holds. At the ten-thousandth invoice "10000" sorts
       * below "9999", the maximum reads as 9999, and the next allocation
       * collides with a number already issued — surfacing as a unique-index
       * violation after the customer's money has been taken.
       */
      const [last] = await tx.$queryRaw<{ seq: number }[]>`
        SELECT MAX(CAST(split_part("invoiceNumber", '/', 3) AS INTEGER)) AS seq
          FROM "transaction"
         WHERE "invoiceNumber" LIKE ${`${prefix}%`}
      `;

      const next = `${prefix}${String((last?.seq ?? 0) + 1).padStart(4, "0")}`;

      await tx.transaction.update({
        where: { id: transactionId },
        data: { invoiceNumber: next, invoicedAt: issuedAt },
      });

      return next;
    },
    { isolationLevel: "Serializable" },
  );
}

export type Invoice = {
  number: string;
  issuedAt: Date;
  seller: {
    legalName: string;
    address: string;
    gstin: string;
    state: string;
  };
  buyer: { name: string; email: string };
  line: {
    description: string;
    sacCode: string;
    quantity: number;
  };
  placeOfSupply: string;
  tax: TaxSplit;
  currency: string;
  status: "PAID" | "REFUNDED";
  refund: { amountMinor: number; at: Date } | null;
};

/**
 * Place of supply for an unregistered customer is their location, and we do not
 * ask for one. Falling back to the supplier's own state would silently convert
 * every sale into an intra-state supply and file the tax to the wrong ledger,
 * so the honest default is the customer's country as recorded at signup, and
 * IGST for anything that is not demonstrably local.
 *
 * If you start selling to GST-registered businesses you will need to collect
 * their GSTIN and state, and this becomes a real field rather than an inference.
 */
function placeOfSupply(country: string): { label: string; intraState: boolean } {
  if (country !== "IN") {
    return { label: `Outside India (${country})`, intraState: false };
  }
  return { label: "India (unregistered recipient)", intraState: false };
}

export async function buildInvoice(
  userId: string,
  transactionId: string,
): Promise<Invoice> {
  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, userId },
    include: { user: { select: { name: true, email: true, country: true } } },
  });

  if (!transaction) throw notFound("No such invoice.");

  if (!transaction.fulfilledAt || !transaction.invoiceNumber) {
    throw new AppError(
      "CONFLICT",
      "An invoice exists only once a payment has been received.",
    );
  }

  if (!COMPANY.tax.gstin) {
    throw new AppError(
      "NOT_CONFIGURED",
      "No GSTIN is configured, so a tax invoice cannot be issued.",
    );
  }

  const supply = placeOfSupply(transaction.user.country ?? "IN");

  return {
    number: transaction.invoiceNumber,
    issuedAt: transaction.invoicedAt ?? transaction.fulfilledAt,
    seller: {
      legalName: COMPANY.legalName,
      address: registeredAddressLine(),
      gstin: COMPANY.tax.gstin,
      state: COMPANY.registeredAddress.state,
    },
    buyer: { name: transaction.user.name, email: transaction.user.email },
    line: {
      description: describe(transaction),
      sacCode: COMPANY.tax.sacCode,
      quantity: 1,
    },
    placeOfSupply: supply.label,
    tax: splitTax(transaction.amountMinor, supply.intraState),
    currency: transaction.currency,
    status: transaction.status === "REFUNDED" ? "REFUNDED" : "PAID",
    refund:
      transaction.refundedAt && transaction.refundAmountMinor
        ? { amountMinor: transaction.refundAmountMinor, at: transaction.refundedAt }
        : null,
  };
}

function describe(transaction: Transaction): string {
  return transaction.purpose === "SUBSCRIPTION"
    ? `Arka ${transaction.planCode ?? ""} plan — ${transaction.creditsGranted} credits`.trim()
    : `Arka credits — ${transaction.creditsGranted}`;
}

/**
 * Assign a number at fulfilment, without ever failing the fulfilment over it.
 *
 * Retries, because the allocation runs Serializable and Postgres resolves a
 * write conflict by aborting one side rather than blocking it. Two payments
 * fulfilled together will reliably produce one abort — and swallowing that
 * quietly leaves a paid transaction with no invoice number, which is not
 * self-healing: nothing revisits it, and the customer gets a CONFLICT every
 * time they ask for their invoice, forever.
 */
export async function issueInvoiceQuietly(transactionId: string): Promise<void> {
  if (!COMPANY.tax.gstin) return; // Not yet a GST-registered business.

  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await allocateInvoiceNumber(transactionId);
      return;
    } catch (error) {
      if (attempt === attempts) {
        logger.error("billing", "Could not allocate an invoice number", {
          transactionId,
          attempts,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      // Brief, jittered: contention here is between a handful of concurrent
      // fulfilments, not a thundering herd.
      await new Promise((resolve) =>
        setTimeout(resolve, 20 * attempt + Math.random() * 40),
      );
    }
  }
}
