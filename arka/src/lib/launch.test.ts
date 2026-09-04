import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isComingSoon, launchMode, PUBLIC_WHILE_CLOSED } from "@/lib/launch";
import { resetDatabase } from "../../test/helpers";

/**
 * The launch gate.
 *
 * The property that matters is the default: a production deploy that sets
 * nothing must be closed. Opening is a deliberate act; being closed is the
 * safe state, because the alternative is a signup form backed by an email
 * sender that is not configured and a generator with no model behind it.
 */

const original = { ...process.env };

afterEach(() => {
  process.env.NEXT_PUBLIC_LAUNCH_MODE = original.NEXT_PUBLIC_LAUNCH_MODE;
  (process.env as Record<string, string>).NODE_ENV = original.NODE_ENV as string;
});

describe("mode", () => {
  it("is closed in production when nothing is set", () => {
    delete process.env.NEXT_PUBLIC_LAUNCH_MODE;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(launchMode()).toBe("coming-soon");
    expect(isComingSoon()).toBe(true);
  });

  it("is open in development when nothing is set, so local work is unaffected", () => {
    delete process.env.NEXT_PUBLIC_LAUNCH_MODE;
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(launchMode()).toBe("live");
  });

  it("obeys an explicit setting in either direction", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_LAUNCH_MODE = "live";
    expect(launchMode()).toBe("live");

    (process.env as Record<string, string>).NODE_ENV = "development";
    process.env.NEXT_PUBLIC_LAUNCH_MODE = "coming-soon";
    expect(launchMode()).toBe("coming-soon");
  });

  it("ignores a value it does not recognise rather than guessing", () => {
    delete process.env.NEXT_PUBLIC_LAUNCH_MODE;
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_LAUNCH_MODE = "sure-why-not";
    expect(launchMode()).toBe("coming-soon");
  });
});

describe("what stays reachable while closed", () => {
  /**
   * The holding page collects email addresses. Collecting one while the
   * privacy policy 404s is exactly the sort of thing this product is meant to
   * be better than.
   */
  it("keeps every policy page public", () => {
    for (const path of ["/privacy", "/terms", "/refunds", "/acceptable-use", "/contact"]) {
      expect(PUBLIC_WHILE_CLOSED).toContain(path);
    }
  });

  it("does not expose the app or auth", () => {
    for (const path of ["/dashboard", "/generate", "/sign-in", "/sign-up", "/admin"]) {
      expect(PUBLIC_WHILE_CLOSED).not.toContain(path);
    }
  });
});

describe("the waitlist", () => {
  beforeEach(resetDatabase);

  it("stores an address once, however many times it is submitted", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await db.waitlistEntry.upsert({
        where: { email: "someone@example.com" },
        create: { email: "someone@example.com" },
        update: {},
      });
    }

    expect(await db.waitlistEntry.count()).toBe(1);
  });

  /** So the launch announcement cannot mail the same person twice. */
  it("records when someone has been told", async () => {
    const entry = await db.waitlistEntry.create({
      data: { email: "someone@example.com" },
    });
    expect(entry.notifiedAt).toBeNull();

    await db.waitlistEntry.update({
      where: { id: entry.id },
      data: { notifiedAt: new Date() },
    });

    const unnotified = await db.waitlistEntry.count({ where: { notifiedAt: null } });
    expect(unnotified).toBe(0);
  });
});
