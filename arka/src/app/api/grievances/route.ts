import { handler, ok, parseBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { consume } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { fileGrievance } from "@/lib/grievances";
import { grievanceInputSchema } from "@/lib/grievance-catalog";

export const dynamic = "force-dynamic";

/**
 * File a grievance.
 *
 * Open to everyone, signed in or not: the person most likely to complain about
 * a video is someone who saw it posted elsewhere and has never heard of Arka.
 * That makes it a public write endpoint, so it is limited by IP — generously,
 * because turning away a genuine safety report costs far more than a few junk
 * submissions landing in the queue.
 *
 * Reachable while the site is closed too. The rules that require a grievance
 * route do not pause for a launch date.
 */
export const POST = handler("api", async (request: Request) => {
  const body = await parseBody(request, grievanceInputSchema);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const limit = await consume("grievance.submit", ip);
  if (!limit.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Too many submissions from this network. Try again in ${Math.ceil(
        limit.resetSec / 60,
      )} minutes, or write to us directly.`,
    );
  }

  // Attached when present so a data request from a signed-in user does not
  // need them to prove separately which account it is about.
  const user = await getCurrentUser();

  const filed = await fileGrievance(body, { userId: user?.id, ip });

  return ok(
    { reference: filed.reference, dueAt: filed.dueAt, acknowledged: filed.acknowledged },
    { status: 201 },
  );
});
