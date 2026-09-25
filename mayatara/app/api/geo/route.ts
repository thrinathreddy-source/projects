// Country of the requesting visitor, read from the header Vercel already sets
// on every request. Replaces a client-side call to ipapi.co, which had two
// problems: the CSP in proxy.ts blocks connect-src to that host, so the check
// silently failed and the outside-India notice never rendered; and it handed
// every visitor's IP address to a third party, which is hard to square with
// the privacy line the rest of the product takes.
//
// Advisory only. The real gate is the country check in /api/auth/register —
// this just lets the page say so before someone fills in the whole form.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const country = req.headers.get("x-vercel-ip-country") || "";
  return Response.json(
    { country },
    { headers: { "Cache-Control": "no-store" } }
  );
}
