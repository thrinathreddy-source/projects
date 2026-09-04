import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { grant } from "@/lib/credits";
import { resetPasswordEmail, sendMail, verifyEmailEmail } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";
import { logger } from "@/lib/logger";

/**
 * Better Auth, backed by our own Postgres through the Prisma adapter.
 *
 * Self-hosted rather than a managed provider: users are rows in our database,
 * so there is no per-MAU bill and no migration to do if we ever want to move.
 */

const config = env();

/**
 * Hand out the welcome credits, at most once per account, ever.
 *
 * Free credits buy real provider capacity, so this is the one place where an
 * unauthenticated stranger can spend our money. Two things bound the exposure:
 * only a verified address collects, and the payout is guarded by a conditional
 * update on `signupGrantedAt` rather than a read-then-write. A verification
 * link that gets opened twice — a prefetching mail client is enough — must not
 * pay twice.
 */
async function grantWelcomeCredits(userId: string): Promise<void> {
  try {
    const settings = await getSettings();
    const amount = settings["signup.grantCredits"];
    if (amount <= 0) return;

    await db.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: userId, signupGrantedAt: null },
        data: { signupGrantedAt: new Date() },
      });

      if (claimed.count === 0) return; // Already collected.

      await grant(userId, amount, "SIGNUP_GRANT", {
        note: "Welcome to Arka",
        tx,
      });
    });
  } catch (error) {
    // Never fail a signup or a verification over the grant; an admin can top up.
    logger.error("auth", "Failed to apply welcome credit grant", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Every origin allowed to make an authenticated request.
 *
 * Better Auth rejects anything not on this list with "Invalid origin" — a
 * total auth outage that says nothing about its own cause. Three real ways to
 * trigger it, all of which this covers:
 *
 *  - **The www variant.** `animearka.com` and `www.animearka.com` are
 *    different origins. Whichever one is not `BETTER_AUTH_URL` breaks sign-in
 *    completely while the marketing pages keep working perfectly, which is the
 *    worst possible shape for a launch-day bug.
 *  - **Vercel previews.** Each deployment gets its own hostname, so without
 *    `VERCEL_URL` here no preview build can be signed into and every branch is
 *    untestable.
 *  - **Local development on a non-default port**, which is how this was found:
 *    the dev server moved to a free port and signup started refusing itself.
 *
 * Explicit origins rather than a wildcard. A pattern like `*.vercel.app`
 * trusts every deployment on the platform, including other people's.
 */
function trustedOrigins(): string[] {
  const origins = new Set<string>();

  const add = (value: string | undefined) => {
    if (!value) return;
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      origins.add(url.origin);
      // The apex/www counterpart, so whichever one the visitor typed works.
      const host = url.host.startsWith("www.") ? url.host.slice(4) : `www.${url.host}`;
      origins.add(`${url.protocol}//${host}`);
    } catch {
      // A malformed URL here must not take down auth for the valid ones.
    }
  };

  add(config.BETTER_AUTH_URL);
  add(process.env.NEXT_PUBLIC_APP_URL);
  // Set by Vercel on every deployment, without a protocol.
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);

  // Development only: the port moves whenever 3000 is taken, and chasing it
  // through .env is friction with no security value on a local machine.
  if (!config.isProduction) {
    for (const port of [3000, 3001]) origins.add(`http://localhost:${port}`);
    const devPort = process.env.PORT;
    if (devPort) origins.add(`http://localhost:${devPort}`);
  }

  return [...origins];
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  trustedOrigins: trustedOrigins(),

  /**
   * Verification gates the free credits, not the account.
   *
   * Blocking sign-in until an email arrives is the biggest drop-off we can
   * avoid, so an unverified user can look around freely — they just cannot
   * spend anything, because they have nothing to spend. That puts the friction
   * exactly where the cost is: throwaway signups are free to us, and a working
   * inbox is what a farm of them cannot cheaply produce.
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,

    sendVerificationEmail: async ({ user, url }) => {
      const settings = await getSettings();
      const mail = verifyEmailEmail(user.name, url, settings["signup.grantCredits"]);
      await sendMail({ ...mail, to: user.email });
    },

    onEmailVerification: async (user: { id: string }) => {
      await grantWelcomeCredits(user.id);
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // See emailVerification above: the gate is on the credits, not the account.
    requireEmailVerification: false,

    resetPasswordTokenExpiresIn: 60 * 60, // one hour

    sendResetPassword: async ({ user, url }) => {
      const mail = resetPasswordEmail(user.name, url);
      await sendMail({ ...mail, to: user.email });
    },
  },

  // Google only appears when both credentials are configured; the sign-in page
  // reads the same flag so it never renders a button that cannot work.
  socialProviders: config.hasGoogleOAuth
    ? {
        google: {
          clientId: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},

  /**
   * Rate limiting, in Postgres rather than in memory.
   *
   * The default memory store is per-process. On Vercel that means each cold
   * start begins with an empty table and concurrent instances never see each
   * other's counts, so the effective limit is whatever it is multiplied by the
   * number of running instances — no use against someone working through a
   * password list. Postgres is already here and every auth request touches it
   * anyway, so a shared counter costs one more statement and actually holds.
   *
   * The defaults for the paths that matter are sensible and left alone: three
   * attempts per ten seconds on sign-in, sign-up and password change, three per
   * minute on anything that sends an email.
   */
  rateLimit: {
    enabled: true, // Better Auth defaults this to production-only.
    storage: "database",
  },

  advanced: {
    ipAddress: {
      trustedProxies: config.trustedProxyCidrs,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most daily
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  // Columns Arka owns. `input: false` keeps them out of the signup payload, so
  // a client cannot mint itself credits or an admin role.
  user: {
    additionalFields: {
      credits: { type: "number", required: false, input: false, defaultValue: 0 },
      creditsHeld: { type: "number", required: false, input: false, defaultValue: 0 },
      planCode: { type: "string", required: false, input: false, defaultValue: "free" },
      country: { type: "string", required: false, input: false, defaultValue: "IN" },
      locale: { type: "string", required: false, input: false, defaultValue: "en" },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Bootstrap admins from an env allowlist. Without this the first admin
        // would have to be promoted with a manual SQL statement.
        before: async (user) => {
          const isAdmin = config.adminEmails.includes(user.email.toLowerCase());
          return { data: { ...user, role: isAdmin ? "admin" : "user" } };
        },

        // Social sign-in arrives already verified — the provider vouched for
        // the address — so those users collect immediately. Everyone else
        // collects from the verification link.
        after: async (user) => {
          if (user.emailVerified) await grantWelcomeCredits(user.id);
        },
      },
    },
  },

  plugins: [
    adminPlugin({ defaultRole: "user", adminRoles: ["admin"] }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session;
