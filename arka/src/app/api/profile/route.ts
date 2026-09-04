import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { LANGUAGES } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1, "Your name cannot be empty.").max(80).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  locale: z
    .string()
    .refine((value) => LANGUAGES.some((language) => language.id === value), {
      message: "Unsupported language.",
    })
    .optional(),
});

export const PATCH = handler("api", async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, schema);

  const updated = await db.user.update({
    where: { id: user.id },
    data: body,
    select: { name: true, country: true, locale: true },
  });

  return ok(updated);
});
