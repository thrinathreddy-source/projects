import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { deleteAccount } from "@/lib/account";

export const dynamic = "force-dynamic";

/**
 * The DPDP erasure right.
 *
 * Confirmation is the account's own email address, typed back. A checkbox is
 * too easy to click through for something irreversible, and asking for the
 * password would mean handling a password on a route that does not need one.
 */
const schema = z.object({
  confirmEmail: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const POST = handler("api", async (request: Request) => {
  const user = await requireUser();
  await enforce("account.delete", user.id);
  const body = await parseBody(request, schema);

  if (body.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError(
      "VALIDATION",
      "That does not match the email on this account.",
    );
  }

  const outcome = await deleteAccount(user.id, {
    reason: body.reason ?? "user request",
    actorId: user.id,
  });

  return ok(outcome);
});
