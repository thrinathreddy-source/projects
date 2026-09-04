import { db } from "@/lib/db";
import { remove as removeObject } from "@/lib/storage";
import { pruneRateLimits } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Housekeeping for things that only ever grew.
 *
 * Every render is an object somebody pays rent on forever, and until now
 * nothing ever deleted one except a user asking. `costs.overheadPerMinuteUsdMicro`
 * — the number the margin dashboard divides by — was a figure typed into an
 * admin form with no process behind it. This is that process.
 *
 * Everything here is conservative by design. The failure mode of deleting too
 * eagerly is destroying work a customer paid for; the failure mode of deleting
 * too little is a slightly larger storage bill. Those are not close.
 */

/** A preview is scaffolding once the full-quality render exists. */
const PREVIEW_GRACE_DAYS = 30;

/** How long a soft-deleted project's rows keep any storage keys at all. */
const SOFT_DELETE_GRACE_DAYS = 7;

/** Cache entries nobody has hit in this long are not earning their row. */
const CACHE_IDLE_DAYS = 60;

/** Operational logs. Long enough to investigate last month's incident. */
const SYSTEM_LOG_DAYS = 30;
const AUDIT_LOG_DAYS = 365;

/** Bounded per run so a backlog cannot outgrow the invocation. */
const BATCH = 200;

export type RetentionResult = {
  previewsPurged: number;
  orphansPurged: number;
  cacheEntriesPruned: number;
  systemLogsPruned: number;
  auditLogsPruned: number;
  rateLimitsPruned: number;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Delete preview renders whose project has a finished FINAL.
 *
 * The preview exists so nobody pays full rate to discover their prompt was
 * wrong. Once the full-quality render is delivered it has done its job, and
 * keeping a second copy of every clip forever is the single largest avoidable
 * line in the storage bill.
 *
 * The row survives with `storageKey: null` rather than being deleted, so the
 * project's history still shows a preview happened and the generation analytics
 * still reconcile.
 */
async function purgeSupersededPreviews(): Promise<number> {
  const cutoff = daysAgo(PREVIEW_GRACE_DAYS);

  const previews = await db.video.findMany({
    where: {
      tier: "PREVIEW",
      storageKey: { not: null },
      createdAt: { lt: cutoff },
      project: {
        deletedAt: null,
        videos: { some: { tier: "FINAL", status: "READY", storageKey: { not: null } } },
      },
    },
    select: { id: true, storageKey: true, thumbnailKey: true, audioKey: true },
    take: BATCH,
  });

  for (const preview of previews) {
    await removeObject(preview.storageKey);
    await removeObject(preview.thumbnailKey);
    await removeObject(preview.audioKey);

    await db.video.update({
      where: { id: preview.id },
      data: {
        storageKey: null,
        thumbnailKey: null,
        audioKey: null,
        hasAudio: false,
        status: "FAILED", // the enum's terminal "no bytes here" state
      },
    });
  }

  return previews.length;
}

/**
 * Objects belonging to soft-deleted projects that were not removed at the time.
 *
 * `projects.remove` deletes the bytes inline, so this should find nothing. It
 * exists because that call site does the deletes outside the transaction that
 * marks the row: a process that dies between the two leaves objects with no
 * owner and nothing that would ever look at them again.
 */
async function purgeDeletedProjectOrphans(): Promise<number> {
  const cutoff = daysAgo(SOFT_DELETE_GRACE_DAYS);

  const projects = await db.project.findMany({
    where: {
      deletedAt: { lt: cutoff },
      OR: [
        { stillKey: { not: null } },
        { videos: { some: { storageKey: { not: null } } } },
      ],
    },
    select: {
      id: true,
      stillKey: true,
      videos: {
        select: { id: true, storageKey: true, thumbnailKey: true, audioKey: true },
      },
    },
    take: BATCH,
  });

  for (const project of projects) {
    for (const video of project.videos) {
      await removeObject(video.storageKey);
      await removeObject(video.thumbnailKey);
      await removeObject(video.audioKey);
    }
    await removeObject(project.stillKey);

    await db.$transaction([
      db.video.updateMany({
        where: { projectId: project.id },
        data: {
          storageKey: null,
          thumbnailKey: null,
          audioKey: null,
          hasAudio: false,
          status: "FAILED",
        },
      }),
      db.project.update({ where: { id: project.id }, data: { stillKey: null } }),
    ]);
  }

  return projects.length;
}

/**
 * Drop idle cache rows — the row only, never the object.
 *
 * A cache entry points at a render that belongs to a project. Deleting the
 * object here would delete a customer's video to save a few cents, which is not
 * a trade anyone would authorise. Objects leave when their project does.
 */
async function pruneRenderCache(): Promise<number> {
  const result = await db.renderCache.deleteMany({
    where: { lastUsedAt: { lt: daysAgo(CACHE_IDLE_DAYS) } },
  });
  return result.count;
}

export async function runRetention(): Promise<RetentionResult> {
  const [previewsPurged, orphansPurged, cacheEntriesPruned] = [
    await purgeSupersededPreviews(),
    await purgeDeletedProjectOrphans(),
    await pruneRenderCache(),
  ];

  const [systemLogs, auditLogs] = await Promise.all([
    db.systemLog.deleteMany({ where: { createdAt: { lt: daysAgo(SYSTEM_LOG_DAYS) } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(AUDIT_LOG_DAYS) } } }),
  ]);

  const rateLimitsPruned = await pruneRateLimits();

  const result: RetentionResult = {
    previewsPurged,
    orphansPurged,
    cacheEntriesPruned,
    systemLogsPruned: systemLogs.count,
    auditLogsPruned: auditLogs.count,
    rateLimitsPruned,
  };

  const total = Object.values(result).reduce((sum, count) => sum + count, 0);
  if (total > 0) logger.event("api", "Retention pass", result);

  return result;
}
