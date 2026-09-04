import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { consume } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("That does not look like an email address."),
  /** Optional campaign tag. Never a full URL — those carry whatever was appended. */
  source: z.string().trim().max(40).optional(),
});

/**
 * Join the waitlist.
 *
 * Unauthenticated by necessity, which makes it the only public write endpoint
 * on the site while it is closed, so it is limited by IP rather than by user.
 *
 * A repeat submission is a success, not an error. Somebody who cannot remember
 * whether they already signed up should be told "you're on the list", not
 * handed a validation failure that reveals whether an address is already
 * stored — which would turn this into an address-enumeration oracle.
 */
export const POST = handler("api", async (request: Request) => {
  const body = await parseBody(request, schema);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const limit = await consume("waitlist.join", ip);
  if (!limit.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Too many attempts. Try again in ${limit.resetSec} seconds.`,
    );
  }

  await db.waitlistEntry.upsert({
    where: { email: body.email },
    create: { email: body.email, source: body.source },
    // Nothing to change. The upsert exists so a duplicate is idempotent
    // rather than a unique-constraint error surfacing as a 500.
    update: {},
  });

  logger.info("api", "Waitlist signup", { source: body.source ?? "direct" });

  return ok({ joined: true });
});
