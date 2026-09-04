import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type SessionUser } from "@/lib/auth";
import { AppError, forbidden, unauthenticated } from "@/lib/errors";

/**
 * Server-side session access.
 *
 * `getSession` is wrapped in React's `cache` so a page that reads the session
 * in a layout, a page and three components still issues one lookup per request.
 */

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Session user with Arka's own columns normalised.
 *
 * Better Auth types `additionalFields` as optional because they are optional in
 * the signup payload, but the database has defaults for every one of them.
 * Filling them in here means no caller has to write `?? "free"`.
 */
export type AppUser = Omit<
  SessionUser,
  "planCode" | "credits" | "creditsHeld" | "role" | "country" | "locale"
> & {
  planCode: string;
  credits: number;
  creditsHeld: number;
  role: string;
  country: string;
  locale: string;
};

function normalise(user: SessionUser): AppUser {
  return {
    ...user,
    planCode: user.planCode ?? "free",
    credits: user.credits ?? 0,
    creditsHeld: user.creditsHeld ?? 0,
    role: user.role ?? "user",
    country: user.country ?? "IN",
    locale: user.locale ?? "en",
  };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await getSession();
  return session?.user ? normalise(session.user) : null;
}

/**
 * For API routes: throws an AppError that the `handler` wrapper turns into a
 * 401/403 response.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  if (user.banned) {
    throw new AppError(
      "BANNED",
      user.banReason
        ? `Your account is suspended: ${user.banReason}`
        : "Your account is suspended.",
    );
  }
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw forbidden("Admins only.");
  return user;
}

/**
 * For pages and layouts: redirects instead of throwing, preserving where the
 * user was trying to go so sign-in can send them back.
 */
export async function requireUserPage(returnTo?: string): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/sign-in${target}`);
  }
  if (user.banned) redirect("/suspended");
  return user;
}

export async function requireAdminPage(): Promise<AppUser> {
  const user = await requireUserPage("/admin");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "admin";
}
