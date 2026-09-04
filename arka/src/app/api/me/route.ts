import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getBalance } from "@/lib/credits";
import { planFor } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** Everything the app shell needs about the signed-in user. */
export const GET = handler("api", async () => {
  const user = await requireUser();
  const [balance, plan] = await Promise.all([
    getBalance(user.id),
    planFor(user.planCode),
  ]);

  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: user.role ?? "user",
    credits: balance.credits,
    creditsHeld: balance.creditsHeld,
    plan: {
      code: plan.code,
      name: plan.name,
      maxDurationSec: plan.maxDurationSec,
      maxConcurrent: plan.maxConcurrent,
      allowFinal: plan.allowFinal,
    },
  });
});
