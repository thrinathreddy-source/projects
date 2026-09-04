import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { createCheckout } from "@/lib/billing";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pack"), packId: z.string().max(40) }),
  z.object({ kind: z.literal("plan"), planCode: z.string().max(40) }),
]);

export const POST = handler("billing", async (request: Request) => {
  const user = await requireUser();
  await enforce("billing.checkout", user.id);
  const intent = await parseBody(request, schema);

  const checkout = await createCheckout(
    { id: user.id, name: user.name, email: user.email, country: user.country },
    intent,
  );

  return ok(checkout, { status: 201 });
});
