import { authenticate } from "@/lib/api-keys";
import { requireUser } from "@/lib/session";
import { AppError, unauthenticated } from "@/lib/errors";
import { getPlan } from "@/lib/plans";

/**
 * Authentication for the public API.
 *
 * Accepts an `Authorization: Bearer arka_sk_…` key, and falls back to the
 * session cookie so the same endpoints are callable from our own dashboard
 * during development without minting a key first.
 */

export type ApiCaller = {
  id: string;
  name: string;
  email: string;
  planCode: string;
  /** How this request was authenticated — recorded on rate-limit decisions. */
  via: "api-key" | "session";
};

export async function requireApiUser(request: Request): Promise<ApiCaller> {
  const user = await authenticate(request.headers.get("authorization"));

  if (user) {
    /**
     * The API is a Studio feature, and until now it was one only on the pricing
     * page. Advertising a tier's headline capability while every tier has it
     * makes the tier meaningless and the page untrue; the gate belongs here,
     * where a key is exchanged for access, rather than on each route.
     */
    if (!getPlan(user.planCode).allowApi) {
      throw new AppError(
        "FORBIDDEN",
        "The HTTP API is available on the Studio plan. Upgrade to use API keys.",
      );
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      planCode: user.planCode,
      via: "api-key",
    };
  }

  // No key, or a key we do not recognise. If an Authorization header was sent
  // at all, say so plainly rather than silently falling through to the cookie —
  // a caller debugging a bad key deserves to be told the key is bad.
  if (request.headers.get("authorization")) {
    throw new AppError("UNAUTHENTICATED", "That API key is not valid or was revoked.");
  }

  const session = await requireUser().catch(() => null);
  if (!session) throw unauthenticated("Provide an API key as a Bearer token.");

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    planCode: session.planCode,
    via: "session",
  };
}
