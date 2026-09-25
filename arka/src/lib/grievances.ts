import crypto from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { COMPANY } from "@/lib/company";
import {
  ACKNOWLEDGE_WITHIN_HOURS,
  describeDeadline,
  getGrievanceCategory,
  grievanceDueAt,
  grievanceInputSchema,
  type GrievanceInput,
} from "@/lib/grievance-catalog";

/**
 * The grievance desk: filing a complaint, telling the complainant we have it,
 * and recording what was decided.
 *
 * Ported from The Mayatara's /contact form and adapted to Arka's rules: the row
 * is the record, the mail is a notification, and nothing here depends on the
 * mail going through. A complaint that was stored but whose notification bounced
 * is still on the admin page and still on the alert clock — which is exactly
 * why the clock is in the database and not in somebody's inbox.
 */

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** No 0/O or 1/I, so a reference read aloud over the phone survives. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** "GRV-7K2M9QXA". Eight characters of 32 is ~10^12 — collisions are a retry, not a design problem. */
export function newReference(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const byte of bytes) out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `GRV-${out}`;
}

function isReferenceCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes("reference");
  return typeof target === "string" ? target.includes("reference") : true;
}

/**
 * A salted hash of the submitting IP. Enough to notice one address filing forty
 * complaints; not enough to identify anybody, and not reversible by a lookup
 * table because the salt is the auth secret.
 */
function hashIp(ip: string | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  return crypto
    .createHash("sha256")
    .update(`${env().BETTER_AUTH_SECRET}:grievance:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Who gets told
// ---------------------------------------------------------------------------

/**
 * Where a new complaint is sent.
 *
 * The named Grievance Officer first, because the rules make it their job; the
 * abuse inbox if that is not filled in yet; the admins as a last resort, so an
 * unfinished `company.ts` never means a complaint goes nowhere.
 */
export function grievanceRecipients(): string[] {
  const officer = COMPANY.grievanceOfficer.email.trim();
  if (officer) return [officer];
  const abuse = COMPANY.email.abuse.trim();
  if (abuse) return [abuse];
  return env().adminEmails;
}

/** `sendMail`, but a thrown error is a `false` — mail is never the record. */
async function trySend(mail: Parameters<typeof sendMail>[0]): Promise<boolean> {
  try {
    return await sendMail(mail);
  } catch (error) {
    logger.error("api", "Grievance mail could not be sent", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

export type FiledGrievance = {
  reference: string;
  dueAt: Date;
  acknowledged: boolean;
};

/**
 * File a complaint.
 *
 * The row is written first and must succeed; everything after it is
 * notification. The complainant's acknowledgement is what starts — and, when it
 * is delivered, satisfies — the 24-hour clock, so `acknowledgedAt` is only set
 * once the mail provider has actually accepted it. If it has not, the alert
 * sweep will say so well before the 24 hours are up.
 */
export async function fileGrievance(
  raw: unknown,
  context: { userId?: string | null; ip?: string },
): Promise<FiledGrievance> {
  const input = grievanceInputSchema.parse(raw);
  const category = getGrievanceCategory(input.category)!;
  const now = new Date();
  const dueAt = grievanceDueAt(input.category, now);

  let grievance: { id: string; reference: string } | null = null;

  for (let attempt = 0; attempt < 3 && !grievance; attempt += 1) {
    try {
      grievance = await db.grievance.create({
        data: {
          reference: newReference(),
          category: input.category,
          name: input.name || null,
          email: input.email,
          message: input.message,
          contentUrl: input.contentUrl || null,
          userId: context.userId ?? null,
          ipHash: hashIp(context.ip),
          dueAt,
        },
        select: { id: true, reference: true },
      });
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
    }
  }

  if (!grievance) {
    throw new AppError("INTERNAL", "We could not record that. Please try again in a moment.");
  }

  logger.event("api", "Grievance filed", {
    reference: grievance.reference,
    category: input.category,
    signedIn: Boolean(context.userId),
  });

  // The officer's copy. One retry: a single transient failure should not be
  // the reason the person responsible never hears about a safety report.
  const officerMail = officerNotification(grievance.reference, input, dueAt);
  const recipients = grievanceRecipients();
  if (recipients.length === 0) {
    // Preflight fails while the officer's address is blank, but a complaint
    // filed on a half-configured deploy should still be impossible to miss.
    logger.error("api", "Grievance filed with nobody to notify", {
      reference: grievance.reference,
      fix: "Fill grievanceOfficer.email in src/lib/company.ts or set ADMIN_EMAILS.",
    });
  }
  for (const to of recipients) {
    let sent = false;
    for (let attempt = 0; attempt < 2 && !sent; attempt += 1) {
      sent = await trySend({ ...officerMail, to });
    }
  }

  const acknowledged = await trySend({
    ...acknowledgementEmail(grievance.reference, category.resolveWithinHours, input),
    to: input.email,
  });

  if (acknowledged) {
    await db.grievance.update({
      where: { id: grievance.id },
      data: { acknowledgedAt: new Date() },
    });
  }

  return { reference: grievance.reference, dueAt, acknowledged };
}

// ---------------------------------------------------------------------------
// Handling
// ---------------------------------------------------------------------------

/**
 * Record that the complainant has been acknowledged by hand.
 *
 * For when the automatic reply bounced and somebody wrote to them directly —
 * the 24-hour obligation is met by whoever meets it.
 */
export async function acknowledgeGrievance(id: string, adminId: string): Promise<void> {
  const grievance = await db.grievance.findUnique({ where: { id } });
  if (!grievance) throw notFound("No such grievance.");
  if (grievance.acknowledgedAt) return;

  await db.$transaction([
    db.grievance.update({ where: { id }, data: { acknowledgedAt: new Date() } }),
    db.auditLog.create({
      data: {
        actorId: adminId,
        action: "grievance.acknowledge",
        targetType: "grievance",
        targetId: id,
        meta: { reference: grievance.reference },
      },
    }),
  ]);
}

export type GrievanceDecision = "resolve" | "dismiss";

/**
 * Close a complaint, with a reason the complainant is sent.
 *
 * Both outcomes need a written reason. A dismissal without one is exactly the
 * kind of decision the complainant is entitled to challenge, and "we looked and
 * did nothing" with no explanation invites that. Taking content down is done
 * from the admin project tools; this records that it happened and why.
 *
 * The status change is conditional on the row still being open, so two admins
 * closing the same complaint cannot both send the complainant a verdict.
 */
export async function decideGrievance(
  id: string,
  decision: GrievanceDecision,
  resolution: string,
  adminId: string,
): Promise<{ notified: boolean }> {
  const text = resolution.trim();
  if (text.length < 10) {
    throw new AppError(
      "VALIDATION",
      "Write the outcome in a sentence or two — it is sent to the complainant.",
    );
  }

  const grievance = await db.grievance.findUnique({ where: { id } });
  if (!grievance) throw notFound("No such grievance.");

  const status = decision === "resolve" ? "RESOLVED" : "DISMISSED";
  const now = new Date();

  const closed = await db.$transaction(async (tx) => {
    const updated = await tx.grievance.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status,
        resolution: text,
        resolvedAt: now,
        resolvedBy: adminId,
        // Deciding it and telling them is also an acknowledgement.
        acknowledgedAt: grievance.acknowledgedAt ?? now,
      },
    });
    if (updated.count === 0) return false;

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: `grievance.${decision}`,
        targetType: "grievance",
        targetId: id,
        meta: {
          reference: grievance.reference,
          category: grievance.category,
          overdue: now > grievance.dueAt,
        },
      },
    });
    return true;
  });

  if (!closed) {
    throw new AppError("CONFLICT", "This grievance has already been closed.");
  }

  logger.event("api", `Grievance ${status.toLowerCase()}`, {
    reference: grievance.reference,
    overdue: now > grievance.dueAt,
  });

  const notified = await trySend({
    ...outcomeEmail(grievance.reference, status, text, grievance.name),
    to: grievance.email,
  });

  return { notified };
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * Open complaints the alert sweep should shout about.
 *
 * Three questions, one query each: is anything past its deadline, is anything
 * about to be, and has anybody gone unacknowledged long enough that the
 * 24-hour promise is at risk. Kept here rather than in `alerts.ts` so the rules
 * about grievances live in one module.
 */
export async function grievanceClock(now = new Date()) {
  const soon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const ackCutoff = new Date(
    now.getTime() - (ACKNOWLEDGE_WITHIN_HOURS / 2) * 60 * 60 * 1000,
  );

  const [overdue, dueSoon, unacknowledged] = await Promise.all([
    db.grievance.count({ where: { status: "OPEN", dueAt: { lt: now } } }),
    db.grievance.count({ where: { status: "OPEN", dueAt: { gte: now, lt: soon } } }),
    db.grievance.count({
      where: { status: "OPEN", acknowledgedAt: null, createdAt: { lt: ackCutoff } },
    }),
  ]);

  return { overdue, dueSoon, unacknowledged };
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

function officerNotification(reference: string, input: GrievanceInput, dueAt: Date) {
  const category = getGrievanceCategory(input.category);

  return {
    subject: `[Arka grievance ${reference}] ${category?.label ?? input.category}`,
    text: [
      `A grievance was filed. Resolve it by ${dueAt.toUTCString()}.`,
      "",
      `Reference: ${reference}`,
      `Category:  ${category?.label ?? input.category}`,
      `From:      ${input.name || "(no name given)"} <${input.email}>`,
      input.contentUrl ? `Content:   ${input.contentUrl}` : "",
      "",
      input.message,
      "",
      `Handle it at ${env().BETTER_AUTH_URL}/admin/grievances`,
      "",
      "— Arka",
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  };
}

function acknowledgementEmail(
  reference: string,
  resolveWithinHours: number,
  input: GrievanceInput,
) {
  const firstName = input.name.split(" ")[0] || "there";

  return {
    subject: `We have your complaint — reference ${reference}`,
    text: [
      `Hi ${firstName},`,
      "",
      `This confirms we received your complaint. Your reference is ${reference}.`,
      "",
      `A person will look at it and reply with a decision within ${describeDeadline(
        resolveWithinHours,
      )}. Quote the reference if you write to us about it.`,
      "",
      "What you sent:",
      "",
      input.message,
      "",
      "If you did not file this, you can ignore this email.",
      "",
      "— Arka",
    ].join("\n"),
  };
}

function outcomeEmail(
  reference: string,
  status: "RESOLVED" | "DISMISSED",
  resolution: string,
  name: string | null,
) {
  const firstName = name?.split(" ")[0] || "there";
  const legal = COMPANY.email.legal.trim();

  return {
    subject: `Your complaint ${reference} — ${status === "RESOLVED" ? "action taken" : "decision"}`,
    text: [
      `Hi ${firstName},`,
      "",
      status === "RESOLVED"
        ? `We have acted on your complaint ${reference}.`
        : `We have looked into your complaint ${reference} and decided not to take action.`,
      "",
      resolution,
      "",
      legal
        ? `If you disagree with this decision, reply to this email or write to ${legal}.`
        : "If you disagree with this decision, reply to this email.",
      "",
      "— Arka",
    ].join("\n"),
  };
}
