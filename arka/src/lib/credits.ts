import type { LedgerReason, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";

/**
 * The credit ledger.
 *
 * Invariant: for every user, SUM(credit_ledger.delta) === user.credits.
 * `user.credits` is a cached total kept in the same transaction as the ledger
 * row, so the two can never drift; `user.creditsHeld` tracks credits reserved
 * by in-flight jobs and is not spendable.
 *
 * Generation follows reserve → settle | release:
 *   reserve  credits -= n, creditsHeld += n, ledger(-n, GENERATION_HOLD)
 *   settle   creditsHeld -= n                (spend confirmed, no ledger row —
 *                                             the hold was the spend)
 *   release  credits += n, creditsHeld -= n, ledger(+n, GENERATION_REFUND)
 *
 * Charging at reserve time rather than on success is deliberate: a user cannot
 * queue fifty jobs against a balance that only covers one.
 */

export type CreditRef = { type: string; id: string };

type Tx = Prisma.TransactionClient;

export type Balance = {
  credits: number;
  creditsHeld: number;
};

export async function getBalance(userId: string): Promise<Balance> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsHeld: true },
  });

  if (!user) throw new AppError("NOT_FOUND", "Account not found.");
  return user;
}

/**
 * Add credits. Used for signup grants, plan renewals, pack purchases and admin
 * adjustments. Positive `amount` only — use `deduct` to take credits away.
 */
export async function grant(
  userId: string,
  amount: number,
  reason: LedgerReason,
  options: { ref?: CreditRef; note?: string; tx?: Tx } = {},
): Promise<number> {
  if (amount <= 0) throw new AppError("VALIDATION", "Grant amount must be positive.");

  const run = async (tx: Tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        balanceAfter: user.credits,
        reason,
        refType: options.ref?.type,
        refId: options.ref?.id,
        note: options.note,
      },
    });

    return user.credits;
  };

  const balance = options.tx ? await run(options.tx) : await db.$transaction(run);

  logger.info("credits", `Granted ${amount} credits`, { userId, reason });
  return balance;
}

/** Remove credits outright (admin correction). Floors at zero. */
export async function deduct(
  userId: string,
  amount: number,
  reason: LedgerReason,
  options: { ref?: CreditRef; note?: string } = {},
): Promise<number> {
  if (amount <= 0) throw new AppError("VALIDATION", "Deduct amount must be positive.");

  return db.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!current) throw new AppError("NOT_FOUND", "Account not found.");

    // Never drive a balance negative — an admin typo should not create debt.
    const applied = Math.min(amount, current.credits);
    if (applied === 0) return 0;

    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: applied } },
      select: { credits: true },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: -applied,
        balanceAfter: user.credits,
        reason,
        refType: options.ref?.type,
        refId: options.ref?.id,
        note: options.note,
      },
    });

    return user.credits;
  });
}

/**
 * Reserve credits for a job. Throws INSUFFICIENT_CREDITS if the balance will
 * not cover it.
 *
 * The guarded `updateMany` is what makes this race-free: two concurrent
 * requests against a balance that only covers one will see exactly one row
 * updated, because the `credits >= amount` predicate is evaluated under the
 * row lock taken by the UPDATE.
 */
export async function reserve(
  userId: string,
  amount: number,
  ref: CreditRef,
  options: { tx?: Tx } = {},
): Promise<number> {
  if (amount <= 0) throw new AppError("VALIDATION", "Reserve amount must be positive.");

  const run = async (tx: Tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: amount } },
      data: { credits: { decrement: amount }, creditsHeld: { increment: amount } },
    });

    if (updated.count === 0) {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        `This needs ${amount} credits and you have ${current?.credits ?? 0}.`,
        { details: { required: amount, available: current?.credits ?? 0 } },
      );
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { credits: true },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: -amount,
        balanceAfter: user.credits,
        reason: "GENERATION_HOLD",
        refType: ref.type,
        refId: ref.id,
      },
    });

    return user.credits;
  };

  return options.tx ? run(options.tx) : db.$transaction(run);
}

/**
 * Confirm a reservation was spent. Only clears the hold — the credits already
 * left the spendable balance at reserve time, and the hold's ledger row is the
 * permanent record of the spend.
 */
export async function settle(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;

  await db.user.updateMany({
    where: { id: userId, creditsHeld: { gte: amount } },
    data: { creditsHeld: { decrement: amount } },
  });
}

/**
 * Return a reservation to the user. Called when a generation fails terminally
 * or is cancelled — a user must never pay for a video they did not receive.
 *
 * Idempotency is the caller's job: the queue only releases a job's hold once,
 * inside the same transaction that marks the job terminal.
 */
export async function release(
  userId: string,
  amount: number,
  ref: CreditRef,
  note?: string,
): Promise<void> {
  if (amount <= 0) return;

  await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount },
        // Guard against a double release driving held credits negative.
        creditsHeld: { decrement: amount },
      },
      select: { credits: true, creditsHeld: true },
    });

    if (user.creditsHeld < 0) {
      await tx.user.update({ where: { id: userId }, data: { creditsHeld: 0 } });
    }

    await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        balanceAfter: user.credits,
        reason: "GENERATION_REFUND",
        refType: ref.type,
        refId: ref.id,
        note,
      },
    });
  });

  logger.info("credits", `Refunded ${amount} credits`, { userId, ref });
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type CostInput = {
  durationSec: number;
  tier: "STILL" | "PREVIEW" | "FINAL";
  voiceId: string;
};

/**
 * What a generation costs the user, in credits.
 *
 * Linear in duration because provider cost is linear in duration. Keeping the
 * two proportional is what makes gross margin per generated second constant
 * regardless of what people generate.
 */
export async function costOf(input: CostInput): Promise<number> {
  const settings = await getSettings();

  // A still is a flat charge, not a per-second one — there is no duration to
  // bill for, and the whole point is that iterating is nearly free.
  if (input.tier === "STILL") return settings["credits.stillCharge"];

  const perSecond =
    input.tier === "FINAL"
      ? settings["credits.finalPerSecond"]
      : settings["credits.previewPerSecond"];

  const voice = input.voiceId === "none" ? 0 : settings["credits.voiceSurcharge"];
  const base = input.durationSec * perSecond + voice;

  return Math.max(base, settings["credits.minimumCharge"]);
}

/** Recent ledger activity for the billing page. */
export async function history(userId: string, limit = 50) {
  return db.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
