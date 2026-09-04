import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  message: z.string().trim().min(1, "Tell us a little more.").max(2000),
  page: z.string().max(200).optional(),
});

export const POST = handler("api", async (request: Request) => {
  // Deliberately open to signed-out visitors — the most useful feedback often
  // comes from someone who bounced before creating an account.
  const user = await getCurrentUser();
  const body = await parseBody(request, schema);

  const feedback = await db.feedback.create({
    data: {
      userId: user?.id,
      rating: body.rating ?? null,
      message: body.message,
      page: body.page,
      meta: {
        userAgent: request.headers.get("user-agent") ?? undefined,
      },
    },
    select: { id: true },
  });

  return ok({ id: feedback.id }, { status: 201 });
});
