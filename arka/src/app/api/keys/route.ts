import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { issue, list } from "@/lib/api-keys";
import { planFor } from "@/lib/projects";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handler("api", async () => {
  const user = await requireUser();
  return ok(await list(user.id));
});

const createSchema = z.object({ name: z.string().trim().max(60).default("") });

export const POST = handler("api", async (request: Request) => {
  const user = await requireUser();
  const plan = await planFor(user.planCode);

  // API access is a Studio feature; gating it here rather than only in the UI
  // means the plan limit holds however the endpoint is reached.
  if (plan.code !== "studio" && user.role !== "admin") {
    throw new AppError("PAYMENT_REQUIRED", "API access is available on the Studio plan.");
  }

  const body = await parseBody(request, createSchema);
  return ok(await issue(user.id, body.name), { status: 201 });
});
