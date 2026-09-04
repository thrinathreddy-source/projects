import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  fulfilPayment,
  fulfilSubscriptionCharge,
  markPaymentFailed,
  markSubscriptionCancelled,
} from "@/lib/billing";
import { balanceOf, expectLedgerBalances, makeUser, resetDatabase } from "../../test/helpers";

/**
 * Fulfilment: the point where money becomes credits.
 *
 * The ledger's own invariants were already covered; this is the door money
 * comes in through, and it was not. Everything here is about redelivery.
 * Razorpay retries a webhook it did not get a 200 for, and it is entitled to —
 * so "granted twice" is not a hypothetical race, it is the documented
 * behaviour of the payment provider on any blip.
 */

beforeEach(resetDatabase);

async function makeOrder(
  userId: string,
  overrides: Partial<{ amountMinor: number; credits: number; planCode: string }> = {},
) {
  return db.transaction.create({
    data: {
      userId,
      provider: "razorpay",
      purpose: overrides.planCode ? "SUBSCRIPTION" : "CREDIT_PACK",
      status: "CREATED",
      amountMinor: overrides.amountMinor ?? 49_900,
      currency: "INR",
      creditsGranted: overrides.credits ?? 500,
      planCode: overrides.planCode,
      providerOrderId: `order_${Math.random().toString(36).slice(2, 12)}`,
    },
  });
}

describe("payment fulfilment", () => {
  it("grants the credits that were paid for", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { credits: 500 });

    const result = await fulfilPayment({
      providerOrderId: order.providerOrderId!,
      providerPaymentId: "pay_1",
      amountMinor: order.amountMinor,
    });

    expect(result).toEqual({ granted: 500 });
    expect((await balanceOf(user)).credits).toBe(500);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe("PAID");
    await expectLedgerBalances(user);
  });

  it("grants once when the same webhook is delivered ten times", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { credits: 500 });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await fulfilPayment({
        providerOrderId: order.providerOrderId!,
        providerPaymentId: "pay_1",
        amountMinor: order.amountMinor,
      });
    }

    expect((await balanceOf(user)).credits).toBe(500);
    expect(await db.creditLedger.count({ where: { userId: user } })).toBe(1);
    await expectLedgerBalances(user);
  });

  /**
   * The guarded claim, not the `fulfilledAt` read above it, is what has to hold
   * this. Two deliveries arriving together both pass the read.
   */
  it("grants once when two deliveries arrive at the same moment", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { credits: 500 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fulfilPayment({
          providerOrderId: order.providerOrderId!,
          providerPaymentId: "pay_1",
          amountMinor: order.amountMinor,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await balanceOf(user)).credits).toBe(500);
    await expectLedgerBalances(user);
  });

  /** A payment for an amount we never asked for is a bug or a tampered checkout. */
  it("refuses to fulfil an amount that does not match the order", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { amountMinor: 49_900, credits: 500 });

    const result = await fulfilPayment({
      providerOrderId: order.providerOrderId!,
      providerPaymentId: "pay_1",
      amountMinor: 100,
    });

    expect(result).toBeNull();
    expect((await balanceOf(user)).credits).toBe(0);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe("CREATED");
  });

  it("ignores a payment for an order it has never heard of", async () => {
    const result = await fulfilPayment({
      providerOrderId: "order_from_another_universe",
      providerPaymentId: "pay_1",
      amountMinor: 49_900,
    });

    expect(result).toBeNull();
  });

  it("moves the buyer onto the plan they bought", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { credits: 1_200, planCode: "creator" });

    await fulfilPayment({
      providerOrderId: order.providerOrderId!,
      providerPaymentId: "pay_1",
      amountMinor: order.amountMinor,
    });

    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user } })).planCode,
    ).toBe("creator");
  });
});

describe("subscription renewal", () => {
  /**
   * `providerSubId` is nullable on the model — a subscription can exist before
   * the provider has issued one — so the helper hands back the id it just set
   * rather than making every caller assert it is there.
   */
  async function makeSubscription(userId: string, planCode = "creator") {
    const providerSubId = `sub_${Math.random().toString(36).slice(2, 12)}`;
    const subscription = await db.subscription.create({
      data: { userId, planCode, provider: "razorpay", status: "ACTIVE", providerSubId },
    });
    return { ...subscription, providerSubId };
  }

  it("grants the month's credits and keeps the plan active", async () => {
    const user = await makeUser(0);
    const subscription = await makeSubscription(user);
    // Upsert, not create: `plan` is catalogue data and deliberately survives
    // the truncate between tests, so it may already be seeded.
    await db.plan.upsert({
      where: { code: "creator" },
      create: {
        code: "creator",
        name: "Creator",
        priceMinorInr: 49_900,
        priceMinorUsd: 700,
        monthlyCredits: 1_200,
        sortOrder: 1,
      },
      update: { monthlyCredits: 1_200 },
    });

    await fulfilSubscriptionCharge({
      providerSubscriptionId: subscription.providerSubId,
      providerPaymentId: "pay_renew_1",
      amountMinor: 49_900,
      currency: "INR",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    expect((await balanceOf(user)).credits).toBe(1_200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user } })).planCode,
    ).toBe("creator");
    await expectLedgerBalances(user);
  });

  /** Idempotency here rests on the unique index over `providerPaymentId`. */
  it("grants once when a renewal webhook is redelivered", async () => {
    const user = await makeUser(0);
    const subscription = await makeSubscription(user);

    const charge = {
      providerSubscriptionId: subscription.providerSubId,
      providerPaymentId: "pay_renew_1",
      amountMinor: 49_900,
      currency: "INR",
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    await fulfilSubscriptionCharge(charge);
    const afterFirst = (await balanceOf(user)).credits;

    await fulfilSubscriptionCharge(charge);

    expect((await balanceOf(user)).credits).toBe(afterFirst);
    expect(await db.transaction.count({ where: { userId: user } })).toBe(1);
    await expectLedgerBalances(user);
  });

  it("ignores a charge against a subscription it does not know", async () => {
    await expect(
      fulfilSubscriptionCharge({
        providerSubscriptionId: "sub_unknown",
        providerPaymentId: "pay_1",
        amountMinor: 49_900,
        currency: "INR",
        periodStart: null,
        periodEnd: null,
      }),
    ).resolves.toBeUndefined();

    expect(await db.transaction.count()).toBe(0);
  });

  /**
   * Cancelling drops the plan but never claws back credits. They were paid for;
   * taking them back because someone stopped subscribing would be indefensible.
   */
  it("drops the plan on cancellation and leaves the credits alone", async () => {
    const user = await makeUser(300);
    const subscription = await makeSubscription(user);
    await db.user.update({ where: { id: user }, data: { planCode: "creator" } });

    await markSubscriptionCancelled(subscription.providerSubId);

    const after = await db.user.findUniqueOrThrow({ where: { id: user } });
    expect(after.planCode).toBe("free");
    expect(after.credits).toBe(300);
    await expectLedgerBalances(user);
  });
});

describe("failed payments", () => {
  it("marks the order failed without touching the balance", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user);

    await markPaymentFailed(order.providerOrderId!, "card declined");

    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe("FAILED");
    expect((await balanceOf(user)).credits).toBe(0);
  });

  /** A failure arriving after a success must not undo the fulfilment. */
  it("cannot mark an already-paid order as failed", async () => {
    const user = await makeUser(0);
    const order = await makeOrder(user, { credits: 500 });

    await fulfilPayment({
      providerOrderId: order.providerOrderId!,
      providerPaymentId: "pay_1",
      amountMinor: order.amountMinor,
    });
    await markPaymentFailed(order.providerOrderId!, "late failure notice");

    const after = await db.transaction.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("PAID");
    expect((await balanceOf(user)).credits).toBe(500);
  });
});
