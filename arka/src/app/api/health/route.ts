import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * For an external monitor to poll.
 *
 * `alerts.ts` is good at noticing a stalled queue or a provider refusing
 * everything, but it runs *inside* this app, on this app's cron. When the
 * deployment itself is broken the cron does not fire, no mail is sent, and the
 * silence is indistinguishable from everything being fine. The worst outage is
 * the one the monitoring cannot report, so that check has to come from outside.
 *
 * Point UptimeRobot, BetterStack or equivalent at this path. It answers 200
 * when the app can serve and reach its database, and 503 when it cannot.
 *
 * Deliberately unauthenticated and deliberately dull: no counts, no queue
 * depth, no version, nothing an unauthenticated stranger could use to infer
 * how the business is doing. A monitor needs a status code, not a dashboard.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const startedAt = Date.now();

  try {
    // The one dependency whose loss makes every request fail. Storage and the
    // model vendors are checked by `alerts.ts`, which can afford nuance;
    // degrading those to a red light here would page someone at 3am because
    // fal was slow.
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      { ok: false, status: "database_unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: "healthy",
      dbLatencyMs: Date.now() - startedAt,
      // Useful for confirming a deploy actually rolled, and harmless: it says
      // nothing about traffic, revenue or capacity.
      environment: env().isProduction ? "production" : "development",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
