import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isComingSoon, PUBLIC_WHILE_CLOSED } from "@/lib/launch";

/**
 * Optimistic route protection. (Next 16's `proxy` convention, formerly
 * `middleware`.)
 *
 * Two jobs. While the site is closed it turns everything except the holding
 * page and the policies away — a signup form that works, backed by an email
 * sender that is not configured and a generator with no model behind it, is a
 * worse first impression than a closed door.
 *
 * Once open it only checks that a session cookie is present, never that it is
 * valid, because validating would mean a database round trip on every request.
 * The real authorisation happens in `requireUserPage` / `requireUser`.
 */

const PROTECTED = ["/dashboard", "/generate", "/projects", "/billing", "/settings", "/admin"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isComingSoon()) {
    const allowed =
      PUBLIC_WHILE_CLOSED.includes(pathname) ||
      // The waitlist is the point of the page; health is for the monitor.
      pathname === "/api/waitlist" ||
      pathname === "/api/health";

    if (!allowed) {
      // Everything else, including auth, goes back to the holding page. A
      // redirect rather than a 404: these are real routes that will work in a
      // week, and a 404 tells a visitor the product does not exist.
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!PROTECTED.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  /**
   * Broader than the protected list, because while the site is closed this has
   * to see the auth and marketing routes too. Static assets and image
   * optimisation are excluded — the holding page still needs its fonts.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|robots.txt|sitemap.xml).*)"],
};
