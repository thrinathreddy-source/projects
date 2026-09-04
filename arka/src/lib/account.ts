import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { remove as removeObject } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * The data-principal rights the DPDP Act 2023 gives every user: to see what we
 * hold about them, and to have it erased.
 *
 * Neither existed. Publishing a privacy policy that promises both while having
 * no mechanism for either is worse than not promising, because the obligation
 * arrives with the first request and there is nothing to serve it with.
 */

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * Everything we hold about one person, as JSON.
 *
 * Deliberately assembled from the tables rather than a database dump: a dump
 * would leak other people's rows through join tables and would be unreadable to
 * the person it is about, which defeats the point of the right.
 *
 * Storage keys are included but signed URLs are not. A URL minted here would
 * still work if the file were forwarded, and an export is a document people
 * email to themselves.
 */
export async function exportAccountData(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, emailVerified: true, image: true,
      planCode: true, credits: true, creditsHeld: true, country: true,
      locale: true, role: true, createdAt: true, updatedAt: true,
    },
  });

  if (!user) throw notFound("Account not found.");

  const [projects, ledger, transactions, generations, apiKeys, feedback] =
    await Promise.all([
      db.project.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: {
          videos: {
            select: {
              tier: true, status: true, storageKey: true, width: true,
              height: true, durationSec: true, hasAudio: true, sizeBytes: true,
              createdAt: true,
            },
          },
        },
      }),
      db.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        // The provider's own ids are ours, not theirs, and exporting them
        // helps nobody exercise a right.
        select: {
          id: true, purpose: true, status: true, amountMinor: true,
          currency: true, creditsGranted: true, planCode: true,
          invoiceNumber: true, invoicedAt: true, refundedAt: true,
          refundAmountMinor: true, createdAt: true,
        },
      }),
      db.generation.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          provider: true, model: true, tier: true, creditsCharged: true,
          durationSec: true, width: true, height: true, success: true,
          cacheHit: true, createdAt: true,
        },
      }),
      db.apiKey.findMany({
        where: { userId },
        // Never the hash. It is a credential, and an export is a file people
        // forward to themselves over email.
        select: { name: true, prefix: true, lastUsedAt: true, createdAt: true },
      }),
      db.feedback.findMany({
        where: { userId },
        select: { message: true, rating: true, page: true, createdAt: true },
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    notice:
      "Everything Arka holds about this account. Financial records are retained " +
      "even after account deletion, because Indian tax law requires it.",
    account: user,
    projects,
    creditLedger: ledger,
    transactions,
    generations,
    apiKeys,
    feedback,
  };
}

// ---------------------------------------------------------------------------
// Erasure
// ---------------------------------------------------------------------------

export type DeletionOutcome = {
  objectsDeleted: number;
  projectsDeleted: number;
  financialRowsRetained: number;
};

/**
 * Erase an account.
 *
 * **Not a hard delete, and deliberately so.** `transaction` and `credit_ledger`
 * cascade from `user`, so `DELETE FROM user` would destroy the financial record
 * — which Indian tax law requires be kept for years after the customer leaves.
 * The DPDP Act anticipates exactly this: erasure does not override a retention
 * obligation imposed by other law.
 *
 * So the two are separated. Everything that identifies a person goes; the
 * money rows stay, attached to an account that no longer names anybody:
 *
 *   deleted   renders, stills, thumbnails, audio — every object
 *             projects (soft-deleted, content cleared)
 *             sessions and OAuth links, so access ends immediately
 *             API keys
 *             feedback (free text, may contain anything)
 *   scrubbed  name, email, image on the user row
 *   retained  transactions, credit ledger, generation analytics — none of
 *             which carry PII once the user row is anonymised
 *
 * Irreversible. The caller is responsible for confirming intent.
 */
export async function deleteAccount(
  userId: string,
  options: { reason?: string; actorId?: string } = {},
): Promise<DeletionOutcome> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (!user) throw notFound("Account not found.");

  /**
   * An admin deleting themselves can lock the whole business out of its own
   * admin surface, and it is not recoverable through the product.
   */
  if (user.role === "admin") {
    const admins = await db.user.count({ where: { role: "admin", banned: false } });
    if (admins <= 1) {
      throw new AppError(
        "CONFLICT",
        "This is the last admin account. Promote another admin before deleting it.",
      );
    }
  }

  const projects = await db.project.findMany({
    where: { userId },
    select: {
      id: true,
      stillKey: true,
      videos: { select: { storageKey: true, thumbnailKey: true, audioKey: true } },
    },
  });

  // Bytes first. A row deleted before its object leaves the object orphaned
  // with nothing left pointing at it — unfindable, and still on the bill.
  let objectsDeleted = 0;
  for (const project of projects) {
    for (const video of project.videos) {
      for (const key of [video.storageKey, video.thumbnailKey, video.audioKey]) {
        if (key) {
          await removeObject(key);
          objectsDeleted += 1;
        }
      }
    }
    if (project.stillKey) {
      await removeObject(project.stillKey);
      objectsDeleted += 1;
    }
  }

  const [ledgerCount, transactionCount] = await Promise.all([
    db.creditLedger.count({ where: { userId } }),
    db.transaction.count({ where: { userId } }),
  ]);

  const anonymous = `deleted-${user.id}@deleted.invalid`;

  await db.$transaction(async (tx) => {
    // Any cached render pointing at this user's objects now points at nothing.
    await tx.renderCache.deleteMany({
      where: { storageKey: { startsWith: `renders/${userId}/` } },
    });

    await tx.video.updateMany({
      where: { project: { userId } },
      data: {
        status: "FAILED",
        storageKey: null,
        thumbnailKey: null,
        audioKey: null,
        hasAudio: false,
      },
    });

    // Prompts and scripts are user-written text and can contain anything.
    await tx.project.updateMany({
      where: { userId },
      data: {
        deletedAt: new Date(),
        stillKey: null,
        title: "Deleted",
        prompt: "",
        script: null,
        errorMessage: null,
      },
    });

    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.apiKey.deleteMany({ where: { userId } });
    await tx.feedback.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted account",
        email: anonymous,
        emailVerified: false,
        image: null,
        // Banned so nothing can authenticate as this row again, and so a
        // password-reset flow cannot resurrect it.
        banned: true,
        banReason: "Account deleted at the user's request",
        credits: 0,
        creditsHeld: 0,
        planCode: "free",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: options.actorId ?? null,
        action: "account.delete",
        targetType: "user",
        targetId: userId,
        meta: {
          reason: options.reason ?? "user request",
          objectsDeleted,
          projectsDeleted: projects.length,
          financialRowsRetained: ledgerCount + transactionCount,
        },
      },
    });
  });

  logger.event("api", "Deleted an account", {
    userId,
    objectsDeleted,
    projectsDeleted: projects.length,
  });

  return {
    objectsDeleted,
    projectsDeleted: projects.length,
    financialRowsRetained: ledgerCount + transactionCount,
  };
}
