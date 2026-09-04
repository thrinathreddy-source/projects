import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { fulfilPayment, refundTransaction } from "@/lib/billing";
import { balanceOf, expectLedgerBalances, makeUser, resetDatabase } from "../../test/helpers";

/**
 * Refunds — money and credits, as one operation.
 *
 * The whole reason this code exists is that refunding from the Razorpay
 * dashboard moves the money and leaves the credits sitting in the account. So
 * the properties worth pinning are not "does it call the API" but "does the
 * balance end up where it should", including when the API fails.
 *
 * The payment provider is the one thing mocked in this suite. Everything else
 * runs against real Postgres because the guarantees are in SQL; this is mocked
 * because the alternative is issuing real refunds against a real Razorpay
 * account from a test run.
 */

const refund = vi.hoisted(() => vi.fn());

vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return {
    ...actual,
    payments: () => ({
      name: "mock",
      isConfigured: () => true,
      refund,
      createOrder: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      verifyWebhook: () => true,
      parseWebhook: vi.fn(),
    }),
  };
});

beforeEach(async () => {
  await resetDatabase();
  refund.mockReset();
  refund.mockResolvedValue({
    providerRefundId: "rfnd_1",
    amountMinor: 49_900,
    status: "processed",
  });
});

/** A user who bought and was granted 500 credits for ₹499. */
async function makePaidPurchase(userId: string, credits = 500, amountMinor = 49_900) {
  const order = await db.transaction.create({
    data: {
      userId,
      provider: "razorpay",
      purpose: "CREDIT_PACK",
      status: "CREATED",
      amountMinor,
      currency: "INR",
      creditsGranted: credits,
      providerOrderId: `order_${Math.random().toString(36).slice(2, 12)}`,
    },
  });

  await fulfilPayment({
    providerOrderId: order.providerOrderId!,
    providerPaymentId: `pay_${order.id}`,
    amountMinor,
  });

  return order.id;
}

describe("a full refund", () => {
  it("returns the money and takes back the credits", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);
    expect((await balanceOf(user)).credits).toBe(500);

    const outcome = await refundTransaction({
      transactionId,
      reason: "changed their mind",
      actorId: user,
    });

    expect(outcome.creditsReversed).toBe(500);
    expect(outcome.creditsAlreadySpent).toBe(0);
    expect((await balanceOf(user)).credits).toBe(0);

    const after = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(after.status).toBe("REFUNDED");
    expect(after.providerRefundId).toBe("rfnd_1");
    await expectLedgerBalances(user);
  });

  it("writes an audit row naming who authorised it", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);

    await refundTransaction({ transactionId, reason: "duplicate charge", actorId: user });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "billing.refund" } });
    expect(audit.targetId).toBe(transactionId);
    expect(audit.actorId).toBe(user);
  });

  /**
   * The case the whole design turns on. Someone buys credits, spends most of
   * them, then asks for their money back. The balance floors at zero — a
   * customer is never left owing us credits, because "negative balance" is a
   * debt we have no way to collect and no business creating.
   */
  it("floors at zero when the credits have already been spent", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user, 500);

    // Spend 400 of the 500.
    await db.user.update({ where: { id: user }, data: { credits: 100 } });
    await db.creditLedger.create({
      data: { userId: user, delta: -400, balanceAfter: 100, reason: "GENERATION_HOLD" },
    });

    const outcome = await refundTransaction({
      transactionId,
      reason: "goodwill",
      actorId: user,
    });

    expect(outcome.creditsReversed).toBe(100);
    expect(outcome.creditsAlreadySpent).toBe(400);
    expect((await balanceOf(user)).credits).toBe(0);
    await expectLedgerBalances(user);
  });

  it("drops a refunded subscriber back to the free plan", async () => {
    const user = await makeUser(0);
    const order = await db.transaction.create({
      data: {
        userId: user,
        provider: "razorpay",
        purpose: "SUBSCRIPTION",
        status: "CREATED",
        amountMinor: 49_900,
        currency: "INR",
        creditsGranted: 500,
        planCode: "creator",
        providerOrderId: `order_${Math.random().toString(36).slice(2, 12)}`,
      },
    });
    await fulfilPayment({
      providerOrderId: order.providerOrderId!,
      providerPaymentId: `pay_${order.id}`,
      amountMinor: 49_900,
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: user } })).planCode).toBe("creator");

    await refundTransaction({ transactionId: order.id, reason: "billed in error", actorId: user });

    expect((await db.user.findUniqueOrThrow({ where: { id: user } })).planCode).toBe("free");
  });
});

describe("a partial refund", () => {
  it("takes back credits in proportion and leaves the transaction paid", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user, 500, 49_900);

    refund.mockResolvedValue({
      providerRefundId: "rfnd_partial",
      amountMinor: 24_950,
      status: "processed",
    });

    const outcome = await refundTransaction({
      transactionId,
      reason: "half refunded by agreement",
      amountMinor: 24_950,
      actorId: user,
    });

    expect(outcome.creditsReversed).toBe(250);
    expect((await balanceOf(user)).credits).toBe(250);

    // Still PAID — a partially refunded payment is not a reversed one.
    const after = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(after.status).toBe("PAID");
    expect(after.refundAmountMinor).toBe(24_950);
    await expectLedgerBalances(user);
  });

  it("refuses an amount larger than the payment", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);

    await expect(
      refundTransaction({
        transactionId,
        reason: "typo",
        amountMinor: 999_999,
        actorId: user,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(refund).not.toHaveBeenCalled();
  });
});

describe("exactly once", () => {
  it("refuses a second refund of the same transaction", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);

    await refundTransaction({ transactionId, reason: "first", actorId: user });

    await expect(
      refundTransaction({ transactionId, reason: "second", actorId: user }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(refund).toHaveBeenCalledTimes(1);
    expect((await balanceOf(user)).credits).toBe(0);
  });

  it("returns the money once when two refunds race", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        refundTransaction({ transactionId, reason: "race", actorId: user }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(refund).toHaveBeenCalledTimes(1);
    await expectLedgerBalances(user);
  });

  it("will not refund a payment that was never fulfilled", async () => {
    const user = await makeUser(0);
    const order = await db.transaction.create({
      data: {
        userId: user,
        provider: "razorpay",
        purpose: "CREDIT_PACK",
        status: "CREATED",
        amountMinor: 49_900,
        currency: "INR",
        creditsGranted: 500,
        providerOrderId: "order_unpaid",
      },
    });

    await expect(
      refundTransaction({ transactionId: order.id, reason: "never paid", actorId: user }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("when the provider refuses", () => {
  /**
   * The claim is released so the refund can be retried, but the clawback is
   * not undone — re-granting on every failed attempt would be a loop that hands
   * out credits nobody paid for. The customer is left short until someone
   * retries, which is visible and fixable; the alternative is not.
   */
  it("releases the claim for a retry and says so plainly", async () => {
    const user = await makeUser(0);
    const transactionId = await makePaidPurchase(user);

    refund.mockRejectedValueOnce(new Error("razorpay is down"));

    await expect(
      refundTransaction({ transactionId, reason: "attempt one", actorId: user }),
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" });

    const after = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(after.refundedAt).toBeNull();
    expect(after.status).toBe("PAID");

    // The clawback is recorded even though the provider call failed. Without
    // this the retry — reading a balance those credits had already left —
    // computes zero, and the row ends up claiming nothing was taken back.
    expect(after.creditsReversed).toBe(500);

    // And the retry succeeds without double-clawing the credits.
    refund.mockResolvedValue({
      providerRefundId: "rfnd_retry",
      amountMinor: 49_900,
      status: "processed",
    });

    const outcome = await refundTransaction({
      transactionId,
      reason: "attempt two",
      actorId: user,
    });

    expect(outcome.creditsReversed).toBe(0); // already taken back on attempt one
    expect((await balanceOf(user)).credits).toBe(0);

    // Still 500 across both attempts, not overwritten by the retry's zero.
    const settled = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(settled.creditsReversed).toBe(500);
    expect(settled.status).toBe("REFUNDED");
    await expectLedgerBalances(user);
  });
});
