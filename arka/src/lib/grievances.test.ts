import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { collectSignals } from "@/lib/alerts";
import { deleteAccount, exportAccountData } from "@/lib/account";
import {
  acknowledgeGrievance,
  decideGrievance,
  fileGrievance,
  grievanceClock,
  newReference,
} from "@/lib/grievances";
import { grievanceDueAt, grievanceInputSchema } from "@/lib/grievance-catalog";
import { makeUser, resetDatabase } from "../../test/helpers";

/**
 * The grievance desk.
 *
 * What matters is that the clock is honest: every complaint gets the deadline
 * its category carries, an acknowledgement is only recorded when one actually
 * went out, and the alert sweep notices a complaint that nobody has answered —
 * because that is the failure nobody would otherwise see.
 */

const sent = vi.hoisted(() => ({ mails: [] as { to: string; subject: string; text: string }[], accept: true }));

vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(async (mail: { to: string; subject: string; text: string }) => {
    sent.mails.push(mail);
    return sent.accept;
  }),
}));

beforeEach(async () => {
  await resetDatabase();
  sent.mails = [];
  sent.accept = true;
});

const HOUR = 60 * 60 * 1000;

const complaint = (overrides: Record<string, unknown> = {}) => ({
  category: "likeness",
  name: "Asha Rao",
  email: "Asha@Example.com",
  message: "A video on Instagram uses my face and makes me say things I never said.",
  contentUrl: "https://instagram.com/p/abc",
  ...overrides,
});

describe("filing", () => {
  it("stores the complaint with a reference and its category's deadline", async () => {
    const before = Date.now();
    const filed = await fileGrievance(complaint(), { ip: "203.0.113.9" });

    expect(filed.reference).toMatch(/^GRV-[2-9A-HJ-NP-Z]{8}$/);

    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    expect(row.email).toBe("asha@example.com");
    expect(row.status).toBe("OPEN");
    // Likeness complaints are on the 24-hour clock.
    expect(row.dueAt.getTime() - before).toBeGreaterThanOrEqual(24 * HOUR - 1000);
    expect(row.dueAt.getTime() - before).toBeLessThanOrEqual(24 * HOUR + 5000);
    // The IP is kept only as a salted hash.
    expect(row.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.ipHash).not.toContain("203.0.113.9");
  });

  it("puts each kind of complaint on its own clock", () => {
    const filedAt = new Date("2026-09-01T00:00:00Z");
    const hoursFor = (category: string) =>
      (grievanceDueAt(category, filedAt).getTime() - filedAt.getTime()) / HOUR;

    expect(hoursFor("sexual")).toBe(24);
    expect(hoursFor("child-safety")).toBe(24);
    expect(hoursFor("religion-community")).toBe(72);
    expect(hoursFor("copyright")).toBe(72);
    expect(hoursFor("personal-data")).toBe(15 * 24);
    // Something that should never happen gets the shortest clock, not none.
    expect(hoursFor("not-a-category")).toBe(24);
  });

  it("tells the officer and acknowledges the complainant", async () => {
    const filed = await fileGrievance(complaint(), {});

    const toComplainant = sent.mails.filter((mail) => mail.to === "asha@example.com");
    expect(toComplainant).toHaveLength(1);
    expect(toComplainant[0].subject).toContain(filed.reference);
    expect(toComplainant[0].text).toContain("24 hours");

    expect(filed.acknowledged).toBe(true);
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    expect(row.acknowledgedAt).not.toBeNull();
  });

  /**
   * The form is public and the acknowledgement goes to whatever address was
   * typed. If it echoed anything the submitter wrote, anyone could use Arka's
   * mail domain to deliver their own text to a stranger.
   */
  it("sends an acknowledgement that carries nothing the submitter typed", async () => {
    await fileGrievance(
      complaint({
        name: "https://phish.example/login Claim your prize",
        email: "stranger@example.test",
        message: "Visit https://phish.example/login to verify your bank account today.",
      }),
      {},
    );

    const ack = sent.mails.find((mail) => mail.to === "stranger@example.test");
    expect(ack).toBeDefined();
    expect(`${ack!.subject}\n${ack!.text}`).not.toContain("phish.example");
    expect(ack!.text).not.toContain("Claim your prize");
  });

  /**
   * The row is the record, not the mail. A bounced acknowledgement must not
   * lose the complaint — and must not be recorded as an acknowledgement either,
   * or the 24-hour clock would read as satisfied when it is not.
   */
  it("keeps the complaint but does not claim an acknowledgement when mail fails", async () => {
    sent.accept = false;

    const filed = await fileGrievance(complaint(), {});

    expect(filed.acknowledged).toBe(false);
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    expect(row.acknowledgedAt).toBeNull();
  });

  it("attaches the account when the complainant is signed in", async () => {
    const userId = await makeUser(0);
    const filed = await fileGrievance(complaint({ category: "personal-data" }), { userId });

    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    expect(row.userId).toBe(userId);
  });

  it("generates references that are readable aloud", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(newReference()).not.toMatch(/[01IO]/);
    }
  });
});

describe("validation", () => {
  it("accepts a complaint without a name or a link", () => {
    const parsed = grievanceInputSchema.safeParse(complaint({ name: undefined, contentUrl: "" }));
    expect(parsed.success).toBe(true);
  });

  /** The link is rendered as an anchor in an admin session. */
  it("refuses a link that is not http(s)", () => {
    for (const contentUrl of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.test/a"]) {
      expect(grievanceInputSchema.safeParse(complaint({ contentUrl })).success).toBe(false);
    }
  });

  it("refuses an unknown category and a message too short to act on", () => {
    expect(grievanceInputSchema.safeParse(complaint({ category: "spam" })).success).toBe(false);
    expect(grievanceInputSchema.safeParse(complaint({ message: "bad video" })).success).toBe(false);
  });

  /**
   * Describing a harmful video often means repeating what it shows. The form
   * must never refuse a report for its own subject matter.
   */
  it("does not run the generation content filter over a report", async () => {
    const filed = await fileGrievance(
      complaint({ category: "sexual", message: "Someone made a nude deepfake of me and posted it." }),
      {},
    );
    expect(filed.reference).toMatch(/^GRV-/);
  });
});

describe("deciding", () => {
  it("closes a complaint, records who and why, and tells the complainant", async () => {
    const adminId = await makeUser(0);
    const filed = await fileGrievance(complaint(), {});
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    sent.mails = [];

    const result = await decideGrievance(row.id, "resolve", "We removed the video and banned the account.", adminId);

    expect(result.notified).toBe(true);
    const closed = await db.grievance.findUniqueOrThrow({ where: { id: row.id } });
    expect(closed.status).toBe("RESOLVED");
    expect(closed.resolvedBy).toBe(adminId);
    expect(closed.resolution).toBe("We removed the video and banned the account.");

    expect(sent.mails).toHaveLength(1);
    expect(sent.mails[0].to).toBe("asha@example.com");
    expect(sent.mails[0].text).toContain("We removed the video");
    // The route to contest it has to be one that is actually read.
    expect(sent.mails[0].text).toContain("/grievance");
    expect(sent.mails[0].text).toContain(filed.reference);

    const audit = await db.auditLog.findFirstOrThrow({ where: { targetId: row.id } });
    expect(audit.action).toBe("grievance.resolve");
  });

  it("requires a written reason, for a dismissal as much as a resolution", async () => {
    const adminId = await makeUser(0);
    const filed = await fileGrievance(complaint(), {});
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });

    await expect(decideGrievance(row.id, "dismiss", "no", adminId)).rejects.toThrow(
      "sent to the complainant",
    );
    expect((await db.grievance.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("OPEN");
  });

  /** Two admins closing the same complaint must not send two verdicts. */
  it("closes a complaint once", async () => {
    const adminId = await makeUser(0);
    const filed = await fileGrievance(complaint(), {});
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });
    sent.mails = [];

    const outcomes = await Promise.allSettled([
      decideGrievance(row.id, "resolve", "Removed the video within the hour.", adminId),
      decideGrievance(row.id, "dismiss", "Nothing here breaks the policy.", adminId),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(sent.mails).toHaveLength(1);
    expect(await db.auditLog.count({ where: { targetId: row.id } })).toBe(1);
  });

  it("records a manual acknowledgement once", async () => {
    sent.accept = false;
    const adminId = await makeUser(0);
    const filed = await fileGrievance(complaint(), {});
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });

    await Promise.all([
      acknowledgeGrievance(row.id, adminId),
      acknowledgeGrievance(row.id, adminId),
    ]);
    await acknowledgeGrievance(row.id, adminId);

    expect((await db.grievance.findUniqueOrThrow({ where: { id: row.id } })).acknowledgedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "grievance.acknowledge" } })).toBe(1);
  });
});

describe("the clock", () => {
  async function file(overrides: { createdAt: Date; dueAt: Date; acknowledgedAt?: Date | null }) {
    const filed = await fileGrievance(complaint(), {});
    await db.grievance.update({ where: { reference: filed.reference }, data: overrides });
  }

  it("is quiet when every complaint is acknowledged and in time", async () => {
    await file({ createdAt: new Date(), dueAt: new Date(Date.now() + 48 * HOUR) });

    expect(await grievanceClock()).toEqual({ overdue: 0, dueSoon: 0, unacknowledged: 0 });
    expect((await collectSignals()).filter((signal) => signal.key.startsWith("grievance."))).toEqual([]);
  });

  it("alerts on a complaint past its deadline", async () => {
    await file({ createdAt: new Date(Date.now() - 30 * HOUR), dueAt: new Date(Date.now() - HOUR) });

    const keys = (await collectSignals()).map((signal) => signal.key);
    expect(keys).toContain("grievance.overdue");
  });

  it("alerts before a deadline, not only after it", async () => {
    await file({ createdAt: new Date(Date.now() - 18 * HOUR), dueAt: new Date(Date.now() + 6 * HOUR) });

    const keys = (await collectSignals()).map((signal) => signal.key);
    expect(keys).toContain("grievance.dueSoon");
    expect(keys).not.toContain("grievance.overdue");
  });

  it("alerts on a complaint nobody has acknowledged, well inside the 24 hours", async () => {
    await file({
      createdAt: new Date(Date.now() - 13 * HOUR),
      dueAt: new Date(Date.now() + 14 * 24 * HOUR),
      acknowledgedAt: null,
    });

    expect((await grievanceClock()).unacknowledged).toBe(1);
    expect((await collectSignals()).map((signal) => signal.key)).toContain(
      "grievance.unacknowledged",
    );
  });

  it("stops alerting once a complaint is closed", async () => {
    const adminId = await makeUser(0);
    await file({ createdAt: new Date(Date.now() - 30 * HOUR), dueAt: new Date(Date.now() - HOUR) });
    const row = await db.grievance.findFirstOrThrow();

    await decideGrievance(row.id, "resolve", "Removed, late, with apologies.", adminId);

    expect(await grievanceClock()).toEqual({ overdue: 0, dueSoon: 0, unacknowledged: 0 });
  });
});

describe("the complainant's own data", () => {
  it("is in their account export", async () => {
    const userId = await makeUser(0);
    const filed = await fileGrievance(complaint({ category: "personal-data" }), { userId });

    const exported = await exportAccountData(userId);
    expect(exported.grievances.map((row) => row.reference)).toEqual([filed.reference]);
  });

  /**
   * Erasure takes who they are off closed complaints, keeps the record that
   * the complaint was answered, and leaves an open one answerable.
   */
  it("is scrubbed from closed complaints on account deletion, and open ones stay answerable", async () => {
    const userId = await makeUser(0);
    const adminId = await makeUser(0);

    const closedRef = (await fileGrievance(complaint(), { userId })).reference;
    const openRef = (await fileGrievance(complaint({ category: "account" }), { userId })).reference;
    const closedRow = await db.grievance.findUniqueOrThrow({ where: { reference: closedRef } });
    await decideGrievance(closedRow.id, "resolve", "Removed the video.", adminId);

    await deleteAccount(userId, { actorId: userId, reason: "test" });

    const closed = await db.grievance.findUniqueOrThrow({ where: { reference: closedRef } });
    expect(closed).toMatchObject({ userId: null, name: null, email: "", message: "", status: "RESOLVED" });
    expect(closed.resolution).toBe("Removed the video.");

    const open = await db.grievance.findUniqueOrThrow({ where: { reference: openRef } });
    expect(open.userId).toBeNull();
    expect(open.email).toBe("asha@example.com");
    expect(open.message).not.toBe("");

    // Answered after the account is gone: the decision still reaches them,
    // and then who they were goes too — which is what the privacy page says.
    sent.mails = [];
    await decideGrievance(open.id, "dismiss", "The suspension stands; the video broke the policy.", adminId);

    expect(sent.mails.map((mail) => mail.to)).toEqual(["asha@example.com"]);
    const answered = await db.grievance.findUniqueOrThrow({ where: { reference: openRef } });
    expect(answered).toMatchObject({ name: null, email: "", message: "", status: "DISMISSED" });
    expect(answered.resolution).toBe("The suspension stands; the video broke the policy.");
  });

  it("leaves complaints from people who never deleted anything alone when closed", async () => {
    const adminId = await makeUser(0);
    const filed = await fileGrievance(complaint(), {});
    const row = await db.grievance.findUniqueOrThrow({ where: { reference: filed.reference } });

    await decideGrievance(row.id, "resolve", "Removed the video.", adminId);

    const closed = await db.grievance.findUniqueOrThrow({ where: { id: row.id } });
    expect(closed.email).toBe("asha@example.com");
  });
});
