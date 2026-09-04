import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { getSettings, setSetting, type SettingKey } from "@/lib/settings";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  key: z.string().max(60),
  value: z.union([z.number(), z.boolean()]),
});

export const GET = handler("admin", async () => {
  await requireAdmin();
  return ok(await getSettings());
});

export const PATCH = handler("admin", async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, schema);

  try {
    // `setSetting` validates the value against that key's own schema, so an
    // out-of-range credit price or a boolean in a number field is rejected here.
    await setSetting(body.key as SettingKey, body.value as never, admin.id);
  } catch {
    throw new AppError("VALIDATION", `"${body.key}" did not accept that value.`);
  }

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: "settings.update",
      targetType: "setting",
      targetId: body.key,
      meta: { value: body.value },
    },
  });

  return ok({ key: body.key, value: body.value });
});
