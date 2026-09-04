import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { estimate } from "@/lib/projects";
import { DURATIONS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const schema = z.object({
  durationSec: z.coerce
    .number()
    .int()
    .refine((value): value is (typeof DURATIONS)[number] =>
      DURATIONS.includes(value as (typeof DURATIONS)[number]),
    ),
  voiceId: z.string().max(40),
  tier: z.enum(["PREVIEW", "FINAL"]).default("PREVIEW"),
});

/**
 * What will this cost me?
 *
 * The generate form calls this as settings change, so the credit price is on
 * screen before anyone commits. Nobody should be surprised by a balance drop.
 */
export const POST = handler("api", async (request: Request) => {
  const user = await requireUser();
  await enforce("estimate", user.id);
  const body = await parseBody(request, schema);

  return ok(
    await estimate(
      user.id,
      { durationSec: body.durationSec, voiceId: body.voiceId },
      body.tier,
    ),
  );
});
