import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { enforce } from "@/lib/rate-limit";
import { exportAccountData } from "@/lib/account";

export const dynamic = "force-dynamic";

/**
 * The DPDP access right, as a file.
 *
 * Downloads rather than renders: the point is that somebody can keep a copy,
 * and a JSON blob in a browser tab is not a copy anybody keeps.
 */
export const GET = handler("api", async () => {
  const user = await requireUser();
  await enforce("account.export", user.id);

  const data = await exportAccountData(user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="arka-account-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
