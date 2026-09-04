import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { refundTransaction } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Issue a refund.
 *
 * Admin-only and deliberately not self-service: a refund is a conversation
 * before it is a button. What matters is that when the decision is made, the
 * money and the credits move together — doing it from the Razorpay dashboard
 * returns the money and leaves the credits spendable.
 */

const schema = z.object({
  transactionId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
  /** Minor units. Omit for a full refund. */
  amountMinor: z.number().int().positive().optional(),
});

export const POST = handler("billing", async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, schema);

  const outcome = await refundTransaction({
    transactionId: body.transactionId,
    reason: body.reason,
    amountMinor: body.amountMinor,
    actorId: admin.id,
  });

  return ok(outcome);
});
