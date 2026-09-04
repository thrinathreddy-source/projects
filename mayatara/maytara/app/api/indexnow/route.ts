import { submitToIndexNow, indexableUrls, INDEXNOW_KEY } from "@/lib/indexnow";
import { SITE } from "@/lib/seo";

// Server-to-server only. This is behind the same CRON_SECRET as the Friday
// match job — not because the payload is sensitive (every URL in it is public)
// but because an open endpoint lets anyone spend this domain's IndexNow quota
// and get its submissions throttled.
//
// Run it after a deploy that changed page content:
//   npm run indexnow
export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return false;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const custom = req.headers.get("x-cron-secret") || "";
  // Lengths differ per header, so compare each in constant time only when it
  // could match at all.
  const safeEqual = (given: string) => {
    if (given.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  };
  return safeEqual(bearer) || safeEqual(custom);
}

export async function POST(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let urls = indexableUrls();

  // Optional { urls: [...] } to submit a subset. Anything off this host is
  // dropped — IndexNow rejects a batch outright if one URL doesn't belong.
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.urls) && body.urls.length > 0) {
      const host = new URL(SITE).host;
      urls = body.urls.filter((u: unknown): u is string => {
        if (typeof u !== "string") return false;
        try { return new URL(u).host === host; } catch { return false; }
      });
      if (urls.length === 0) {
        return Response.json({ error: "No URLs on this host." }, { status: 400 });
      }
    }
  } catch {
    // No body — submit the full set.
  }

  try {
    const result = await submitToIndexNow(urls);
    return Response.json({
      ok: result.ok,
      status: result.status,
      count: result.submitted.length,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urls: result.submitted,
    }, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return Response.json(
      { error: "IndexNow submission failed.", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
