import { NextResponse } from "next/server";
import { storage, verifyLocalSignature } from "@/lib/storage";
import { handler } from "@/lib/api";
import { AppError } from "@/lib/errors";

/**
 * Serves objects for the local filesystem storage driver.
 *
 * Only used when R2 is not configured — with R2, signed URLs point straight at
 * Cloudflare and never touch this app. Authorisation is the HMAC signature in
 * the query string, exactly mirroring how an R2 presigned URL behaves, so both
 * drivers grant access the same way.
 */

type Context = { params: Promise<{ key: string[] }> };

export const GET = handler("storage", async (request: Request, context: Context) => {
  const { key: segments } = await context.params;
  const key = segments.join("/");

  const url = new URL(request.url);
  const expiresAt = Number(url.searchParams.get("e"));
  const signature = url.searchParams.get("s") ?? "";

  if (!verifyLocalSignature(key, expiresAt, signature)) {
    throw new AppError("FORBIDDEN", "This link has expired.");
  }

  const object = await storage().get(key);
  if (!object) throw new AppError("NOT_FOUND", "File not found.");

  const headers = new Headers({
    "Content-Type": object.contentType,
    "Content-Length": String(object.body.byteLength),
    "Cache-Control": "private, max-age=3600",
    // Renders are user content; never let a browser sniff them into HTML.
    "X-Content-Type-Options": "nosniff",
  });

  const downloadAs = url.searchParams.get("d");
  if (downloadAs) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${downloadAs.replace(/["\\\r\n]/g, "")}"`,
    );
  }

  return new NextResponse(new Uint8Array(object.body), { headers });
});
