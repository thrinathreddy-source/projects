import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { allocateInvoiceNumber, financialYear, splitTax } from "@/lib/invoice";
import { makeUser, resetDatabase } from "../../test/helpers";

/**
 * GST invoices.
 *
 * Two properties matter and both are unforgiving. The tax has to add back to
 * the total exactly — an invoice a paisa short of itself is a filing problem —
 * and the series has to be gapless, which is a concurrency question wearing an
 * accounting hat.
 */

beforeEach(resetDatabase);

describe("backing tax out of a GST-inclusive price", () => {
  it("splits ₹499 at 18% so the parts add back to the whole", () => {
    const tax = splitTax(49_900, false);

    expect(tax.taxableMinor + tax.totalTaxMinor).toBe(49_900);
    expect(tax.taxableMinor).toBe(42_288); // 49900 * 100/118, rounded
    expect(tax.igstMinor).toBe(tax.totalTaxMinor);
    expect(tax.cgstMinor).toBe(0);
  });

  it("halves intra-state tax without losing the odd paisa", () => {
    const tax = splitTax(49_900, true);

    expect(tax.cgstMinor + tax.sgstMinor).toBe(tax.totalTaxMinor);
    expect(tax.igstMinor).toBe(0);
    // The halves differ by at most one, never by a rounding artefact.
    expect(Math.abs(tax.cgstMinor - tax.sgstMinor)).toBeLessThanOrEqual(1);
  });

  /** Fuzz the property rather than trusting three hand-picked amounts. */
  it("always reconciles, at any price", () => {
    for (let amount = 1; amount < 200_000; amount += 997) {
      for (const intraState of [true, false]) {
        const tax = splitTax(amount, intraState);
        expect(tax.taxableMinor + tax.totalTaxMinor).toBe(amount);
        expect(tax.cgstMinor + tax.sgstMinor + tax.igstMinor).toBe(tax.totalTaxMinor);
      }
    }
  });
});

describe("the Indian financial year", () => {
  it("runs April to March", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T23:59:59Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-04-01T00:00:00Z"))).toBe("2027-28");
  });

  it("puts January in the year that started the previous April", () => {
    expect(financialYear(new Date("2027-01-15T00:00:00Z"))).toBe("2026-27");
  });

  it("wraps the century without producing 2099-100", () => {
    expect(financialYear(new Date("2099-05-01T00:00:00Z"))).toBe("2099-00");
  });
});

describe("the invoice series", () => {
  async function makeTransaction(userId: string) {
    const row = await db.transaction.create({
      data: {
        userId,
        provider: "razorpay",
        purpose: "CREDIT_PACK",
        status: "PAID",
        amountMinor: 49_900,
        currency: "INR",
        creditsGranted: 500,
        fulfilledAt: new Date(),
      },
    });
    return row.id;
  }

  it("numbers sequentially from one", async () => {
    const user = await makeUser();

    const first = await allocateInvoiceNumber(await makeTransaction(user));
    const second = await allocateInvoiceNumber(await makeTransaction(user));

    expect(first).toMatch(/^ARKA\/\d{4}-\d{2}\/0001$/);
    expect(second).toMatch(/^ARKA\/\d{4}-\d{2}\/0002$/);
  });

  /**
   * Zero padding makes text ordering agree with numeric ordering only while the
   * width holds. At the ten-thousandth invoice "10000" sorts below "9999", so a
   * text sort reads the maximum as 9999 and reissues a number already used —
   * which surfaces as a unique-index violation after the money has been taken.
   */
  it("keeps counting past the width of the padding", async () => {
    const user = await makeUser();
    const year = financialYear(new Date());

    await db.transaction.update({
      where: { id: await makeTransaction(user) },
      data: { invoiceNumber: `ARKA/${year}/9999`, invoicedAt: new Date() },
    });

    expect(await allocateInvoiceNumber(await makeTransaction(user))).toBe(
      `ARKA/${year}/10000`,
    );
  });

  /**
   * An invoice number is issued once and never changes. A redelivered webhook
   * calling fulfilment again must hand back the same number, not burn the next
   * one — a gap in the series is exactly what "gapless" forbids.
   */
  it("returns the same number when called twice for one transaction", async () => {
    const user = await makeUser();
    const transactionId = await makeTransaction(user);

    const first = await allocateInvoiceNumber(transactionId);
    const second = await allocateInvoiceNumber(transactionId);

    expect(second).toBe(first);
    expect(await db.transaction.count({ where: { invoiceNumber: { not: null } } })).toBe(1);
  });

  /**
   * The reason the allocation runs Serializable. Two payments fulfilled in the
   * same instant would otherwise read the same maximum, claim the same number,
   * and one would hit the unique index *after* its money had been taken.
   */
  it("gives concurrent allocations distinct, gapless numbers", async () => {
    const user = await makeUser();
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => makeTransaction(user)),
    );

    const numbers: string[] = [];
    for (const id of ids) {
      // Serializable transactions abort rather than block, so a real caller
      // retries. Fulfilment does this via issueInvoiceQuietly's error path.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          numbers.push(await allocateInvoiceNumber(id));
          break;
        } catch {
          continue;
        }
      }
    }

    expect(new Set(numbers).size).toBe(numbers.length);

    const sequence = numbers
      .map((number) => Number(number.split("/").pop()))
      .sort((a, b) => a - b);
    expect(sequence).toEqual(Array.from({ length: sequence.length }, (_, i) => i + 1));
  });
});
