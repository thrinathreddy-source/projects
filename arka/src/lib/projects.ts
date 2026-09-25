import crypto from "node:crypto";
import type { Prisma, RenderTier } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { generationInputSchema, type GenerationInput } from "@/lib/catalog";
import { enforceModeration, flagForReview } from "@/lib/moderation-server";
import { getPlan, type PlanDefinition } from "@/lib/plans";
import { costOf, reserve } from "@/lib/credits";
import { enqueue, cancel as cancelJob } from "@/lib/queue";
import { getSettings } from "@/lib/settings";
import { getProvider } from "@/lib/providers";
import { remove as removeObject, signedUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Project lifecycle — the workflow this product actually sells.
 *
 * Everything a generation needs to be safe happens here, in one transaction:
 * the project row, the queue job and the credit reservation are created
 * together or not at all. A user can never end up with credits deducted and no
 * job, or a job nobody paid for.
 */

/**
 * Prisma's unique-constraint error, narrowed to one field.
 *
 * Matched structurally rather than with `instanceof`: the error class lives in
 * the generated client, and importing runtime values from there into a module
 * this widely used drags the whole client into places that only need types.
 */
function isUniqueViolation(error: unknown, field: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" ? target.includes(field) : true;
}

/** Effective plan limits. The DB row wins so an admin can change them live. */
export async function planFor(planCode: string): Promise<PlanDefinition> {
  const fallback = getPlan(planCode);
  const row = await db.plan.findUnique({ where: { code: planCode } });
  if (!row) return fallback;

  return {
    ...fallback,
    code: fallback.code,
    name: row.name,
    priceMinorInr: row.priceMinorInr,
    priceMinorUsd: row.priceMinorUsd,
    monthlyCredits: row.monthlyCredits,
    maxConcurrent: row.maxConcurrent,
    maxDurationSec: row.maxDurationSec,
    allowFinal: row.allowFinal,
  };
}

export type Estimate = {
  credits: number;
  tier: RenderTier;
  balance: number;
  affordable: boolean;
};

export async function estimate(
  userId: string,
  input: Pick<GenerationInput, "durationSec" | "voiceId">,
  tier: RenderTier = "PREVIEW",
): Promise<Estimate> {
  const [credits, user] = await Promise.all([
    costOf({ durationSec: input.durationSec, tier, voiceId: input.voiceId }),
    db.user.findUnique({ where: { id: userId }, select: { credits: true } }),
  ]);

  const balance = user?.credits ?? 0;
  return { credits, tier, balance, affordable: balance >= credits };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateInput = GenerationInput & {
  /** Client-supplied token so a retried request does not create a second job. */
  clientToken?: string;
};

export async function create(
  user: { id: string; planCode: string },
  raw: CreateInput,
) {
  const settings = await getSettings();
  if (!settings["flags.generationEnabled"]) {
    throw new AppError(
      "NOT_CONFIGURED",
      "Generation is paused for maintenance. Try again shortly.",
    );
  }

  const input = generationInputSchema.parse(raw);

  // Before anything is reserved or queued. A refusal must cost the user
  // nothing, and must not leave a project row behind describing what they
  // asked for.
  const screened = await enforceModeration(input, user.id);

  const plan = await planFor(user.planCode);

  if (input.durationSec > plan.maxDurationSec) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `${plan.name} tops out at ${plan.maxDurationSec}-second clips. Upgrade for longer.`,
      { details: { maxDurationSec: plan.maxDurationSec } },
    );
  }

  // Concurrency cap. Without it one account can occupy the entire queue and
  // every other customer waits behind them.
  const inFlight = await db.job.count({
    where: {
      status: { in: ["QUEUED", "RUNNING", "DEFERRED"] },
      project: { userId: user.id },
    },
  });

  if (inFlight >= plan.maxConcurrent) {
    throw new AppError(
      "RATE_LIMITED",
      `You already have ${inFlight} render${inFlight === 1 ? "" : "s"} in progress. ${
        plan.code === "free"
          ? "Wait for it to finish, or upgrade to run more at once."
          : "Wait for one to finish."
      }`,
    );
  }

  // Creating a project buys stage one only. Motion is a separate, explicit,
  // far more expensive decision the user makes after seeing the still.
  const credits = await costOf({
    durationSec: input.durationSec,
    tier: "STILL",
    voiceId: input.voiceId,
  });

  const idempotencyKey = raw.clientToken
    ? crypto
        .createHash("sha256")
        .update(`${user.id}:${raw.clientToken}`)
        .digest("hex")
        .slice(0, 40)
    : undefined;

  if (idempotencyKey) {
    const existing = await db.job.findUnique({
      where: { idempotencyKey },
      select: { projectId: true },
    });
    if (existing) {
      // A duplicate submit resolves to the job that already exists.
      return db.project.findUniqueOrThrow({ where: { id: existing.projectId } });
    }
  }

  const project = await db
    .$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          userId: user.id,
          title: input.title,
          prompt: input.prompt,
          script: input.script || null,
          style: input.style,
          language: input.language,
          voiceId: input.voiceId,
          setting: input.setting,
          aspectRatio: input.aspectRatio,
          durationSec: input.durationSec,
          status: "QUEUED",
        },
      });

      const job = await enqueue({
        projectId: created.id,
        type: "GENERATE_STILL",
        creditsHeld: credits,
        // Paying customers wait behind nobody on the free tier.
        priority: plan.code === "free" ? 0 : plan.sortOrder,
        idempotencyKey,
        tx,
      });

      // Last, so an insufficient balance rolls back the project and the job.
      await reserve(user.id, credits, { type: "job", id: job.id }, { tx });

      return created;
    })
    .catch(async (error: unknown) => {
      /**
       * The lookup above is the fast path; this is the correct one.
       *
       * Two submits carrying the same token can both miss that read and race
       * here, where the unique index settles it. Letting P2002 escape would
       * turn a double-clicked Generate into a 500 — the exact request the
       * idempotency key exists to make harmless.
       */
      if (idempotencyKey && isUniqueViolation(error, "idempotencyKey")) {
        const winner = await db.job.findUnique({
          where: { idempotencyKey },
          select: { projectId: true },
        });
        if (winner) {
          return db.project.findUniqueOrThrow({ where: { id: winner.projectId } });
        }
      }
      throw error;
    });

  // Not a gate — the render proceeds either way. This only asks a person to
  // look afterwards at the cases a binary filter has to guess about.
  await flagForReview(input, { userId: user.id, projectId: project.id }, screened.review);

  logger.info("queue", `Queued project ${project.id}`, {
    userId: user.id,
    credits,
    durationSec: input.durationSec,
  });

  return project;
}

/**
 * Re-roll the still.
 *
 * The cheap loop, and the one users should spend most of their time in. A fresh
 * seed guarantees a genuinely different image rather than the same one back.
 */
export async function rerollStill(user: { id: string }, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id, deletedAt: null },
  });
  if (!project) throw notFound("Project not found.");

  if (project.stillApprovedAt) {
    throw new AppError(
      "CONFLICT",
      "This still has already been animated. Start a new project to try another look.",
    );
  }

  const active = await db.job.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } },
  });
  if (active) throw new AppError("CONFLICT", "Something is already running.");

  const credits = await costOf({
    durationSec: project.durationSec,
    tier: "STILL",
    voiceId: project.voiceId,
  });

  await db.$transaction(async (tx) => {
    const job = await enqueue({
      projectId,
      type: "GENERATE_STILL",
      creditsHeld: credits,
      payload: { seed: Math.floor(Math.random() * 2_147_483_647) },
      tx,
    });
    await reserve(user.id, credits, { type: "job", id: job.id }, { tx });
    await tx.project.update({
      where: { id: projectId },
      data: { status: "QUEUED", progress: 0, errorMessage: null },
    });
  });

  return { credits };
}

/**
 * Approve the still and buy motion.
 *
 * The one place in the product where real money gets committed. Everything
 * before it costs a few credits; this costs a multiple of that, so it is
 * deliberately a separate, explicit action rather than something that happens
 * automatically when a still finishes.
 */
export async function animate(
  user: { id: string; planCode: string },
  projectId: string,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id, deletedAt: null },
  });
  if (!project) throw notFound("Project not found.");

  // Re-checked here, not only at creation. The prompt cannot be edited, so
  // this catches a different case: a rule added *after* a project was made.
  // Motion is the expensive, shareable artifact — the last gate before
  // something exists that can be downloaded and posted.
  await enforceModeration(project, user.id);

  if (!project.stillKey) {
    throw new AppError("CONFLICT", "There is no still to animate yet.");
  }

  const active = await db.job.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } },
  });
  if (active) throw new AppError("CONFLICT", "A render is already in progress.");

  const plan = await planFor(user.planCode);

  // The zero-inventory guarantee, enforced here rather than only in the UI.
  // Stills are ours to give away; motion is not.
  if (!plan.allowMotion) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "Animating needs a paid plan. Stills are free — upgrade when a composition is worth moving.",
    );
  }

  const credits = await costOf({
    durationSec: project.durationSec,
    tier: "PREVIEW",
    voiceId: project.voiceId,
  });

  await db.$transaction(async (tx) => {
    const job = await enqueue({
      projectId,
      type: "GENERATE_PREVIEW",
      creditsHeld: credits,
      priority: plan.code === "free" ? 0 : plan.sortOrder,
      tx,
    });
    await reserve(user.id, credits, { type: "job", id: job.id }, { tx });
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: "QUEUED",
        progress: 0,
        errorMessage: null,
        stillApprovedAt: new Date(),
      },
    });
  });

  logger.info("queue", `Animating project ${projectId}`, { userId: user.id, credits });
  return { credits };
}

/**
 * Queue a full-quality render of a project that already has a preview.
 *
 * Previews exist so nobody pays full rate to discover their prompt was wrong;
 * this is the deliberate second step where the expensive render happens.
 */
export async function requestFinal(
  user: { id: string; planCode: string },
  projectId: string,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id, deletedAt: null },
    include: { videos: true },
  });

  if (!project) throw notFound("Project not found.");

  // Re-checked here, not only at creation. The prompt cannot be edited, so
  // this catches a different case: a rule added *after* a project was made.
  // Motion is the expensive, shareable artifact — the last gate before
  // something exists that can be downloaded and posted.
  await enforceModeration(project, user.id);

  const plan = await planFor(user.planCode);
  if (!plan.allowFinal) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "Full-quality renders are available on paid plans.",
    );
  }

  if (project.videos.some((video) => video.tier === "FINAL" && video.status === "READY")) {
    throw new AppError("CONFLICT", "This project already has a full-quality render.");
  }

  const active = await db.job.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } },
  });
  if (active) throw new AppError("CONFLICT", "A render is already in progress.");

  const credits = await costOf({
    durationSec: project.durationSec,
    tier: "FINAL",
    voiceId: project.voiceId,
  });

  await db.$transaction(async (tx) => {
    const job = await enqueue({
      projectId,
      type: "GENERATE_FINAL",
      creditsHeld: credits,
      priority: plan.sortOrder + 10, // paid, explicit intent — jump the queue
      tx,
    });

    await reserve(user.id, credits, { type: "job", id: job.id }, { tx });

    await tx.project.update({
      where: { id: projectId },
      data: { status: "QUEUED", progress: 0, errorMessage: null },
    });
  });

  return { credits };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type ProjectListFilters = {
  status?: "all" | "READY" | "FAILED" | "RUNNING";
  search?: string;
  cursor?: string;
  limit: number;
};

export async function list(userId: string, filters: ProjectListFilters) {
  const where: Prisma.ProjectWhereInput = {
    userId,
    deletedAt: null,
  };

  if (filters.status && filters.status !== "all") {
    where.status =
      filters.status === "RUNNING" ? { in: ["QUEUED", "RUNNING"] } : filters.status;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { prompt: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const rows = await db.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: {
      videos: {
        where: { status: "READY" },
        orderBy: { tier: "desc" },
      },
    },
  });

  return rows;
}

export type ProjectView = Awaited<ReturnType<typeof get>>;

export async function get(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    include: {
      videos: { orderBy: { tier: "desc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!project) throw notFound("Project not found.");

  // Signed URLs are minted per request and expire; nothing in the database
  // ever holds a URL that would still work if it leaked.
  const videos = await Promise.all(
    project.videos.map(async (video) => ({
      ...video,
      url: video.storageKey ? await signedUrl(video.storageKey) : null,
      thumbnailUrl: video.thumbnailKey ? await signedUrl(video.thumbnailKey) : null,
      // Only surfaced when the audio is *not* already inside the container —
      // otherwise the player would lay narration over itself.
      audioUrl:
        video.audioKey && !video.audioMuxed ? await signedUrl(video.audioKey) : null,
    })),
  );

  return {
    ...project,
    stillUrl: project.stillKey ? await signedUrl(project.stillKey) : null,
    videos,
  };
}

/** Lightweight shape for the progress poller — no signed URLs unless ready. */
export async function status(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: {
      id: true,
      status: true,
      progress: true,
      errorMessage: true,
      updatedAt: true,
      stillKey: true,
      stillApprovedAt: true,
      videos: {
        where: { status: "READY" },
        select: {
          id: true,
          tier: true,
          storageKey: true,
          thumbnailKey: true,
          audioKey: true,
          audioMuxed: true,
        },
        orderBy: { tier: "desc" },
      },
    },
  });

  if (!project) throw notFound("Project not found.");

  const videos = await Promise.all(
    project.videos.map(async (video) => ({
      id: video.id,
      tier: video.tier,
      url: video.storageKey ? await signedUrl(video.storageKey) : null,
      thumbnailUrl: video.thumbnailKey ? await signedUrl(video.thumbnailKey) : null,
      audioUrl:
        video.audioKey && !video.audioMuxed ? await signedUrl(video.audioKey) : null,
    })),
  );

  return {
    id: project.id,
    status: project.status,
    progress: project.progress,
    errorMessage: project.errorMessage,
    stillUrl: project.stillKey ? await signedUrl(project.stillKey) : null,
    stillApproved: Boolean(project.stillApprovedAt),
    videos,
  };
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

export async function cancel(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    include: { jobs: { where: { status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } } } },
  });

  if (!project) throw notFound("Project not found.");
  if (project.jobs.length === 0) {
    throw new AppError("CONFLICT", "There is nothing running to cancel.");
  }

  for (const job of project.jobs) {
    // Tell the provider to stop first — that is what actually stops the meter.
    if (job.providerName && job.providerJobId) {
      await getProvider(job.providerName)
        .cancel(job.providerJobId)
        .catch(() => {});
    }
    // Releases the credit hold as part of the terminal transition.
    await cancelJob(job.id, "Cancelled by you.");
  }
}

/**
 * Soft-delete the row, hard-delete the bytes.
 *
 * Keeping the project row preserves the credit ledger's references and the
 * cost history that tells us whether we are profitable; removing the objects
 * is what the user actually asked for and what stops us paying to store them.
 */
export async function remove(userId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    include: { videos: true, jobs: { where: { status: { in: ["QUEUED", "RUNNING", "DEFERRED"] } } } },
  });

  if (!project) throw notFound("Project not found.");

  for (const job of project.jobs) {
    await cancelJob(job.id, "Project deleted.");
  }

  for (const video of project.videos) {
    await removeObject(video.storageKey);
    await removeObject(video.thumbnailKey);
    await removeObject(video.audioKey);
  }

  // The still is user content too. Leaving it behind meant every deleted
  // project kept paying rent on an image we had been asked to destroy.
  await removeObject(project.stillKey);

  // Any cached render pointing at this project's objects now points at nothing.
  // Dropping the rows here turns a guaranteed miss into no lookup at all.
  await db.renderCache
    .deleteMany({ where: { storageKey: { startsWith: `renders/${userId}/${projectId}/` } } })
    .catch(() => {});

  await db.$transaction([
    db.video.updateMany({
      where: { projectId },
      data: {
        status: "FAILED",
        storageKey: null,
        thumbnailKey: null,
        audioKey: null,
        hasAudio: false,
      },
    }),
    db.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), stillKey: null },
    }),
  ]);

  logger.info("api", `Deleted project ${projectId}`, { userId });
}
