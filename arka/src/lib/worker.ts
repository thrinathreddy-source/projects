import crypto from "node:crypto";
import type { Job, Project, RenderTier } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  buildImagePrompt,
  buildMotionPrompt,
  getAspectRatio,
  getStyle,
  narrationText,
  NO_VOICE,
} from "@/lib/catalog";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { grant, settle as settleCredits } from "@/lib/credits";
import { estimateNarrationCost, synthesize } from "@/lib/providers/voice-router";
import { postProcess } from "@/lib/mux";
import { estimateStillCost, generateStill } from "@/lib/providers/image-router";
import { signedUrl } from "@/lib/storage";
import * as queue from "@/lib/queue";
import { chargeBudget, nextBudgetWindow, reconcileBudget } from "@/lib/budget";
import { dispatch, getProvider } from "@/lib/providers";
import type { GenerateRequest, ProviderStatus } from "@/lib/providers/types";
import {
  copyObject,
  extensionFor,
  fetchAsset,
  ingest,
  putObject,
  storageKey,
  type FetchedAsset,
  type StoredObject,
} from "@/lib/storage";

/**
 * What a queue step actually does.
 *
 * The worker is a step function, not a long-running loop: each tick either
 * dispatches a job to a provider or polls one already dispatched, then hands
 * the job back to the queue. That keeps every invocation short and bounded,
 * which is what lets the same code run under a Vercel cron and as a standalone
 * process, and means a deploy mid-render loses nothing.
 */

/** Seconds between polls of a running provider job. */
const POLL_INTERVAL_SEC = 5;

/**
 * How long a single tick may run before it must hand everything back.
 *
 * This is the number that has to fit inside the host's function timeout, and
 * every other budget here is carved out of it. The default leaves ten seconds
 * of headroom under a 60-second limit, which is the smallest ceiling any Vercel
 * plan imposes — raise `WORKER_TICK_BUDGET_MS` alongside `maxDuration` if you
 * are on a plan that allows longer.
 */
const DEFAULT_TICK_BUDGET_MS = Number(process.env.WORKER_TICK_BUDGET_MS ?? 50_000);

/**
 * What the expensive step needs: pull the render into memory, synthesise and
 * fetch narration, run the cadence encode, upload the result.
 *
 * Nothing starts this step without this much time left. Getting killed halfway
 * through is the worst available outcome — the provider has already been paid,
 * the lease then has to expire before anything notices, and the retry pays for
 * the whole render again.
 */
const FINISH_BUDGET_MS = 40_000;

/** Ceiling on the ffmpeg call, sized to fit inside FINISH_BUDGET_MS. */
const POST_PROCESS_TIMEOUT_MS = 25_000;

/** Copying a cached render server-side, plus its bookkeeping. */
const CACHE_BUDGET_MS = 10_000;

/** Dispatching or polling: two HTTP calls and a couple of writes. */
const LIGHT_BUDGET_MS = 8_000;

/**
 * The clock a tick works against.
 *
 * The step function was already designed so that stopping between steps loses
 * nothing. This is what makes it stop between steps rather than wherever the
 * platform happens to pull the plug.
 */
export class Deadline {
  private readonly endsAt: number;

  constructor(budgetMs: number = DEFAULT_TICK_BUDGET_MS) {
    this.endsAt = Date.now() + budgetMs;
  }

  remainingMs(): number {
    return this.endsAt - Date.now();
  }

  /** Is there room to start something that could take `costMs`? */
  allows(costMs: number): boolean {
    return this.remainingMs() >= costMs;
  }

  /** A timeout for a child process that cannot outlive this tick. */
  clamp(timeoutMs: number): number {
    return Math.max(1_000, Math.min(timeoutMs, this.remainingMs() - 2_000));
  }
}

export type TickResult = {
  claimed: number;
  reclaimed: number;
  deadLettered: number;
  errors: number;
  /** Jobs handed straight back because the tick ran out of time. */
  deferredForTime: number;
};

export type TickOptions = {
  /** Override the tick's time budget. Standalone workers can afford more. */
  budgetMs?: number;
};

export async function runTick(
  workerId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const deadline = new Deadline(options.budgetMs);
  const settings = await getSettings();

  const reclaimed = await queue.reclaimStale();
  const deadLettered = await queue.sweepExhausted();

  if (!settings["flags.generationEnabled"]) {
    return { claimed: 0, reclaimed, deadLettered, errors: 0, deferredForTime: 0 };
  }

  const jobs = await queue.claim(workerId, settings["queue.batchSize"]);
  let errors = 0;
  let deferredForTime = 0;

  // Sequential rather than parallel: each step is short, and serialising keeps
  // a single tick's database and provider load predictable.
  for (const job of jobs) {
    // Out of time. Put the rest straight back rather than holding leases we
    // cannot honour — another tick is along in seconds, and a job sitting in
    // RUNNING behind a dead invocation waits out the whole lease instead.
    if (!deadline.allows(LIGHT_BUDGET_MS)) {
      await queue.reschedule(job.id, 0);
      deferredForTime += 1;
      continue;
    }

    try {
      const outcome = await step(job, deadline);
      if (outcome === "out-of-time") deferredForTime += 1;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error("worker", `Step threw for job ${job.id}`, { message });
      await queue.fail(job.id, message, true);
    }
  }

  if (deferredForTime > 0) {
    logger.info("worker", `Tick ${workerId} ran out of time`, { deferredForTime });
  }

  return { claimed: jobs.length, reclaimed, deadLettered, errors, deferredForTime };
}

type StepOutcome = "done" | "out-of-time";

async function step(job: Job, deadline: Deadline): Promise<StepOutcome> {
  const project = await db.project.findUnique({ where: { id: job.projectId } });

  if (!project || project.deletedAt) {
    await queue.cancel(job.id, "Project was deleted.");
    return "done";
  }

  // Stage one is synchronous and cheap enough to finish inside a single tick,
  // so it never acquires a provider job id to poll.
  if (job.type === "GENERATE_STILL") {
    await stillStep(job, project);
    return "done";
  }

  if (!job.providerJobId) {
    return dispatchStep(job, project, deadline);
  }

  return pollStep(job, project, deadline);
}

// ---------------------------------------------------------------------------
// Stage one — the still
// ---------------------------------------------------------------------------

/**
 * Render the establishing frame and stop.
 *
 * This is the money decision in the whole pipeline. An image costs roughly a
 * hundredth of a video, so every wrong idea should die here rather than after a
 * motion render. The job succeeds, the project parks in STILL_READY, and
 * nothing else happens until the user explicitly asks for motion.
 */
async function stillStep(job: Job, project: Project): Promise<void> {
  const dimensions = getAspectRatio(project.aspectRatio);
  const { prompt, negativePrompt } = buildImagePrompt(project);

  const request = {
    requestId: job.id,
    prompt,
    negativePrompt,
    width: dimensions.width,
    height: dimensions.height,
    // A re-roll passes a seed through the payload so the user gets a different
    // image rather than the same one back.
    seed: (job.payload as { seed?: number } | null)?.seed,
  };

  const estimated = estimateStillCost(request);
  if (!(await chargeBudget(estimated))) {
    await queue.defer(
      job.id,
      nextBudgetWindow(),
      "Daily rendering budget reached — this will run automatically tomorrow.",
    );
    return;
  }

  const startedAt = Date.now();
  const still = await generateStill(request);

  const stored = await ingest(
    still.url,
    storageKey({
      userId: project.userId,
      projectId: project.id,
      tier: "STILL",
      kind: "video", // reuses the key layout; the extension distinguishes it
      extension: extensionFor(still.contentType),
    }),
    still.contentType,
  );

  await db.project.update({
    where: { id: project.id },
    data: {
      stillKey: stored.key,
      stillApprovedAt: null,
      status: "STILL_READY",
      progress: 100,
      errorMessage: null,
    },
  });

  await reconcileBudget(estimated, still.costUsdMicro);

  await recordGeneration(job, project, {
    success: true,
    costUsdMicro: still.costUsdMicro,
    latencyMs: Date.now() - startedAt,
    width: still.width,
    height: still.height,
    provider: still.provider,
    model: still.model,
  });

  await settleCredits(project.userId, job.creditsHeld);
  await queue.succeed(job.id);

  logger.info("worker", `Rendered still for ${project.id}`, {
    provider: still.provider,
    costUsdMicro: still.costUsdMicro,
  });
}

// ---------------------------------------------------------------------------
// Step 1 — dispatch
// ---------------------------------------------------------------------------

async function dispatchStep(
  job: Job,
  project: Project,
  deadline: Deadline,
): Promise<StepOutcome> {
  const request = await toGenerateRequest(job, project);
  const settings = await getSettings();

  // A previous identical render is free money: same output, zero provider cost.
  if (settings["cache.enabled"] && deadline.allows(CACHE_BUDGET_MS)) {
    const hit = await tryCache(job, project, request);
    if (hit) return "done";
  }

  const { estimateCost } = await import("@/lib/providers");

  // Budget for narration up front too — it is a second vendor bill, and a cap
  // that only counts video would let real spend drift past it.
  const estimated =
    (await estimateCost(request)) +
    estimateNarrationCost({
      requestId: job.id,
      text: narrationText(project),
      language: project.language,
      voiceId: project.voiceId,
      targetDurationSec: project.durationSec,
    });

  // The budget guard runs before we spend, not after. Deferring keeps the
  // user's place in line and their credits reserved.
  const withinBudget = await chargeBudget(estimated);
  if (!withinBudget) {
    await queue.defer(
      job.id,
      nextBudgetWindow(),
      "Daily rendering budget reached — this will run automatically tomorrow.",
    );
    return "done";
  }

  const result = await dispatch(request);

  await db.job.update({
    where: { id: job.id },
    data: {
      providerName: result.providerName,
      providerJobId: result.providerJobId,
      estimatedCostUsdMicro: result.estimatedCostUsdMicro,
      dispatchedAt: new Date(),
      payload: { model: result.model },
    },
  });

  await db.project.update({
    where: { id: project.id },
    data: { status: "RUNNING", progress: 5, errorMessage: null },
  });

  logger.info("worker", `Dispatched job ${job.id} to ${result.providerName}`, {
    model: result.model,
    estimatedCostUsdMicro: result.estimatedCostUsdMicro,
  });

  await queue.reschedule(job.id, POLL_INTERVAL_SEC);
  return "done";
}

// ---------------------------------------------------------------------------
// Step 2 — poll
// ---------------------------------------------------------------------------

async function pollStep(
  job: Job,
  project: Project,
  deadline: Deadline,
): Promise<StepOutcome> {
  const provider = getProvider(job.providerName ?? "mock");

  // Wall-clock timeout. A provider that never reports terminal state would
  // otherwise hold a job — and the user's credits — indefinitely.
  const startedAt = job.dispatchedAt ?? job.startedAt ?? job.createdAt;
  if (Date.now() - startedAt.getTime() > job.timeoutSec * 1000) {
    await provider.cancel(job.providerJobId!).catch(() => {});
    await recordGeneration(job, project, {
      success: false,
      errorCode: "TIMEOUT",
      errorText: `No result after ${job.timeoutSec}s.`,
    });
    await queue.fail(job.id, "The render timed out.", true);
    return "done";
  }

  const status = await provider.status(job.providerJobId!);

  if (status.state === "queued" || status.state === "running") {
    await db.project.update({
      where: { id: project.id },
      data: {
        status: "RUNNING",
        // Never let a reported percentage move backwards — a bar that
        // retreats reads as a bug even when the provider is being honest.
        progress: Math.max(project.progress, Math.min(95, status.progress)),
      },
    });
    await queue.heartbeat(job.id);
    await queue.reschedule(job.id, POLL_INTERVAL_SEC);
    return "done";
  }

  if (status.state === "cancelled") {
    await queue.cancel(job.id, "Cancelled at the provider.");
    return "done";
  }

  if (status.state === "failed") {
    const error = status.error;
    await recordGeneration(job, project, {
      success: false,
      errorCode: error?.code ?? "PROVIDER_FAILED",
      errorText: error?.message ?? "The provider reported a failure.",
    });
    await queue.fail(
      job.id,
      error?.message ?? "The provider could not render this.",
      error?.retryable ?? true,
    );
    return "done";
  }

  /**
   * The render exists at the vendor and is ours to collect — but collecting it
   * is the one genuinely expensive step, and starting it without room to finish
   * means being killed mid-encode with the provider already paid.
   *
   * Handing the job straight back costs one more poll. The provider's result
   * does not expire between ticks, and `status()` is idempotent, so the next
   * tick picks up exactly here.
   */
  if (!deadline.allows(FINISH_BUDGET_MS)) {
    await queue.heartbeat(job.id);
    await queue.reschedule(job.id, 0);
    logger.info("worker", `Deferring the finish step for job ${job.id}`, {
      remainingMs: deadline.remainingMs(),
      neededMs: FINISH_BUDGET_MS,
    });
    return "out-of-time";
  }

  await finish(job, project, status, deadline);
  return "done";
}

// ---------------------------------------------------------------------------
// Step 3 — persist the result
// ---------------------------------------------------------------------------

async function finish(
  job: Job,
  project: Project,
  status: ProviderStatus,
  deadline: Deadline,
): Promise<void> {
  if (!status.video) {
    await queue.fail(job.id, "The provider returned no video.", true);
    return;
  }

  const tier = job.type === "GENERATE_FINAL" ? "FINAL" : "PREVIEW";

  // Provider URLs expire, so pull the bytes now. They stay in memory rather
  // than going straight to storage because narration has to be muxed in first.
  const rendered = await fetchAsset(status.video.url, status.video.contentType);

  const narration = await narrate(job, project);

  // The cadence pass. This is what makes output read as drawn animation
  // rather than smooth AI video, so it runs on every render — narrated or
  // not — and muxes the narration in the same encode when there is any.
  const style = getStyle(project.style);
  const processed = await postProcess({
    video: rendered,
    audio: narration?.audio,
    cadence: { drawingsPerSecond: style.drawingsPerSecond },
    timeoutMs: deadline.clamp(POST_PROCESS_TIMEOUT_MS),
  });

  const deliverable = processed ?? rendered;
  // Narration only ended up inside the container if post-processing succeeded.
  const audioMuxed = Boolean(processed && narration);

  /**
   * Narration that was synthesised but never made it into the container.
   *
   * The player can still lay the separate track over the video, but the
   * download endpoint hands over the video object and nothing else — so what
   * the customer actually keeps is a silent file they paid a surcharge for.
   * A failed synthesis already refunds that surcharge; this is the same outcome
   * arriving through a different door, and it has to be treated the same way.
   */
  if (narration && !audioMuxed) {
    await refundNarration(
      job,
      project,
      "Narration could not be muxed into the delivered file",
    );
  }

  const video = await putObject(
    storageKey({
      userId: project.userId,
      projectId: project.id,
      tier,
      kind: "video",
      extension: extensionFor(deliverable.contentType),
    }),
    deliverable.body,
    deliverable.contentType,
  );

  let thumbnail: StoredObject | null = null;
  if (status.thumbnail) {
    thumbnail = await ingest(
      status.thumbnail.url,
      storageKey({
        userId: project.userId,
        projectId: project.id,
        tier,
        kind: "thumb",
        extension: extensionFor(status.thumbnail.contentType),
      }),
      status.thumbnail.contentType,
    ).catch(() => null); // a missing thumbnail is cosmetic, not fatal
  }

  const dimensions = getAspectRatio(project.aspectRatio);

  await db.$transaction(async (tx) => {
    await tx.video.upsert({
      where: { id: `${project.id}-${tier}` },
      create: {
        id: `${project.id}-${tier}`,
        projectId: project.id,
        tier,
        status: "READY",
        storageKey: video.key,
        thumbnailKey: thumbnail?.key,
        sizeBytes: video.sizeBytes,
        audioKey: narration?.audioKey,
        audioMuxed,
        audioDurationSec: narration?.durationSec,
        width: status.video?.width ?? dimensions.width,
        height: status.video?.height ?? dimensions.height,
        durationSec: status.video?.durationSec ?? project.durationSec,
        // Only true when narration actually exists — not merely requested.
        hasAudio: Boolean(narration),
        providerName: job.providerName,
        providerJobId: job.providerJobId,
      },
      update: {
        status: "READY",
        storageKey: video.key,
        thumbnailKey: thumbnail?.key,
        sizeBytes: video.sizeBytes,
        audioKey: narration?.audioKey,
        audioMuxed,
        audioDurationSec: narration?.durationSec,
        hasAudio: Boolean(narration),
      },
    });

    await tx.project.update({
      where: { id: project.id },
      data: { status: "READY", progress: 100, errorMessage: null },
    });
  });

  // Narration is a second vendor bill on the same job; margin maths has to see
  // both or the per-minute profit figure is wrong.
  const actualCost =
    (status.costUsdMicro ?? job.estimatedCostUsdMicro) + (narration?.costUsdMicro ?? 0);
  await reconcileBudget(job.estimatedCostUsdMicro, actualCost);

  await recordGeneration(job, project, {
    success: true,
    costUsdMicro: actualCost,
    latencyMs: Date.now() - (job.dispatchedAt ?? job.createdAt).getTime(),
    width: status.video.width ?? dimensions.width,
    height: status.video.height ?? dimensions.height,
  });

  await rememberCache(job, project, video, thumbnail, dimensions, narration, audioMuxed);

  // The hold becomes a spend. Only now — a user who never got a video keeps
  // their credits.
  await settleCredits(project.userId, job.creditsHeld);
  await queue.succeed(job.id);

  logger.info("worker", `Completed job ${job.id}`, {
    projectId: project.id,
    provider: job.providerName,
    costUsdMicro: actualCost,
  });
}

// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

type NarrationOutcome = {
  audioKey: string;
  durationSec?: number;
  costUsdMicro: number;
  /** The synthesised bytes, handed to the post-process pass to be muxed in. */
  audio: FetchedAsset;
};

/**
 * Add narration to a finished render.
 *
 * Returns null when the project asked for no voice, or when synthesis failed —
 * and in the failure case refunds the narration surcharge, because charging for
 * audio we did not deliver is exactly the kind of thing that loses a customer
 * permanently. A silent video is still a video; a failed job is not.
 */
async function narrate(
  job: Job,
  project: Project,
): Promise<NarrationOutcome | null> {
  if (project.voiceId === NO_VOICE) return null;

  const tier = job.type === "GENERATE_FINAL" ? "FINAL" : "PREVIEW";

  try {
    const speech = await synthesize({
      requestId: job.id,
      text: narrationText(project),
      language: project.language,
      voiceId: project.voiceId,
      targetDurationSec: project.durationSec,
    });

    const audio = await fetchAsset(speech.url, speech.contentType);

    const stored = await putObject(
      storageKey({
        userId: project.userId,
        projectId: project.id,
        tier,
        kind: "audio",
        extension: extensionFor(audio.contentType),
      }),
      audio.body,
      audio.contentType,
    );

    logger.info("worker", `Narrated job ${job.id}`, {
      provider: speech.provider,
      language: project.language,
    });

    return {
      audioKey: stored.key,
      durationSec: speech.durationSec,
      costUsdMicro: speech.costUsdMicro,
      audio,
    };
  } catch (error) {
    logger.error("worker", `Narration failed for job ${job.id}, delivering silent`, {
      error: error instanceof Error ? error.message : String(error),
    });

    await refundNarration(job, project, "Narration could not be generated");
    return null;
  }
}

/**
 * Hand back the narration surcharge.
 *
 * The full hold is settled as spent when the render lands, so this is a
 * separate grant rather than a smaller settlement — the ledger keeps both
 * movements, which is what makes a support question answerable later.
 *
 * Never throws: a failed refund must not cost the user the render as well.
 */
async function refundNarration(
  job: Job,
  project: Project,
  reason: string,
): Promise<void> {
  if (project.voiceId === NO_VOICE) return;

  const settings = await getSettings();
  const surcharge = settings["credits.voiceSurcharge"];
  if (surcharge <= 0) return;

  await grant(project.userId, surcharge, "GENERATION_REFUND", {
    ref: { type: "job", id: job.id },
    note: reason,
  }).catch((error: unknown) => {
    logger.error("worker", `Could not refund the narration surcharge`, {
      jobId: job.id,
      surcharge,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.info("worker", `Refunded the narration surcharge for job ${job.id}`, {
    surcharge,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Render cache
// ---------------------------------------------------------------------------

/**
 * Identical inputs produce an identical render, so paying twice for one is pure
 * waste. The hash covers every parameter that reaches the provider — change any
 * of them and it is a different render.
 *
 * Scoped to the user, deliberately, at the cost of some hit rate.
 *
 * A global cache is strictly cheaper and was the wrong trade. Two customers who
 * type the same short prompt — and on a product with a fixed style catalogue
 * they will — would receive the byte-identical clip, and both would post it.
 * Selling someone a video of their story means it has to be theirs. The saving
 * that matters is the same person re-rolling the same parameters, and that one
 * is kept.
 */
function cacheKeyFor(project: Project, tier: string): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        project.userId,
        project.prompt.trim().toLowerCase(),
        // Narration is baked into the delivered file, so two projects that
        // share a prompt but not a script are not the same render.
        (project.script ?? "").trim().toLowerCase(),
        project.style,
        project.aspectRatio,
        project.durationSec,
        project.language,
        project.voiceId,
        tier,
      ]),
    )
    .digest("hex");
}

async function tryCache(
  job: Job,
  project: Project,
  request: GenerateRequest,
): Promise<boolean> {
  const hash = cacheKeyFor(project, request.tier);
  const cached = await db.renderCache.findUnique({ where: { paramsHash: hash } });
  if (!cached) return false;

  try {
    const extension = cached.storageKey.split(".").pop() ?? "mp4";
    const video = await copyObject(
      cached.storageKey,
      storageKey({
        userId: project.userId,
        projectId: project.id,
        tier: request.tier,
        kind: "video",
        extension,
      }),
    );

    // Narration lives alongside the render as its own object; a cache hit has
    // to bring it across too, or a project would silently lose its audio track.
    const audio = cached.audioKey
      ? await copyObject(
          cached.audioKey,
          storageKey({
            userId: project.userId,
            projectId: project.id,
            tier: request.tier,
            kind: "audio",
            extension: cached.audioKey.split(".").pop() ?? "mp3",
          }),
        )
      : null;

    await db.$transaction(async (tx) => {
      await tx.video.upsert({
        where: { id: `${project.id}-${request.tier}` },
        create: {
          id: `${project.id}-${request.tier}`,
          projectId: project.id,
          tier: request.tier,
          status: "READY",
          storageKey: video.key,
          sizeBytes: video.sizeBytes,
          audioKey: audio?.key,
          audioMuxed: cached.audioMuxed,
          hasAudio: Boolean(audio) || cached.audioMuxed,
          width: cached.width,
          height: cached.height,
          durationSec: cached.durationSec,
          providerName: cached.provider,
        },
        update: {
          status: "READY",
          storageKey: video.key,
          audioKey: audio?.key,
          audioMuxed: cached.audioMuxed,
          hasAudio: Boolean(audio) || cached.audioMuxed,
        },
      });

      await tx.project.update({
        where: { id: project.id },
        data: { status: "READY", progress: 100 },
      });

      await tx.renderCache.update({
        where: { paramsHash: hash },
        data: { hits: { increment: 1 }, lastUsedAt: new Date() },
      });
    });

    await recordGeneration(job, project, {
      success: true,
      cacheHit: true,
      costUsdMicro: 0,
      latencyMs: 0,
      width: cached.width ?? undefined,
      height: cached.height ?? undefined,
      // Attribute the hit to whoever originally rendered it, so per-provider
      // analytics show the full volume a provider is responsible for.
      provider: cached.provider,
      model: cached.model,
    });

    await settleCredits(project.userId, job.creditsHeld);
    await queue.succeed(job.id);

    logger.info("worker", `Cache hit for job ${job.id}`, { hash });
    return true;
  } catch (error) {
    // A stale cache entry (object deleted underneath us) must not fail the job.
    logger.warn("worker", "Cache hit could not be served, rendering fresh", {
      hash,
      error: error instanceof Error ? error.message : String(error),
    });
    await db.renderCache.delete({ where: { paramsHash: hash } }).catch(() => {});
    return false;
  }
}

async function rememberCache(
  job: Job,
  project: Project,
  video: StoredObject,
  thumbnail: StoredObject | null,
  dimensions: { width: number; height: number },
  narration: NarrationOutcome | null,
  audioMuxed: boolean,
): Promise<void> {
  const settings = await getSettings();
  if (!settings["cache.enabled"]) return;

  const tier = job.type === "GENERATE_FINAL" ? "FINAL" : "PREVIEW";
  const hash = cacheKeyFor(project, tier);

  const row = {
    storageKey: video.key,
    thumbnailKey: thumbnail?.key,
    audioKey: narration?.audioKey,
    audioMuxed,
    width: dimensions.width,
    height: dimensions.height,
    durationSec: project.durationSec,
    sizeBytes: video.sizeBytes,
    provider: job.providerName ?? "unknown",
    model: readModel(job),
  };

  await db.renderCache
    .upsert({
      where: { paramsHash: hash },
      create: { paramsHash: hash, ...row },
      update: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Cache bookkeeping is an optimisation; never fail a delivered render.
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readModel(job: Job): string {
  const payload = job.payload as { model?: string } | null;
  return payload?.model ?? "unknown";
}

/**
 * Which tier a job's spend belongs to.
 *
 * Stills used to fall into the PREVIEW bucket, which made the two halves of the
 * pipeline indistinguishable in the profitability table — and the gap between
 * them is the whole pricing argument: an image costs a hundredth of a motion
 * render, and the business only works if most attempts stop at the image.
 */
function tierOf(job: Job): RenderTier {
  if (job.type === "GENERATE_STILL") return "STILL";
  return job.type === "GENERATE_FINAL" ? "FINAL" : "PREVIEW";
}

async function toGenerateRequest(job: Job, project: Project): Promise<GenerateRequest> {
  const { prompt, negativePrompt } = buildMotionPrompt(project);
  const dimensions = getAspectRatio(project.aspectRatio);

  return {
    requestId: job.id,
    prompt,
    negativePrompt,
    style: project.style,
    aspectRatio: project.aspectRatio,
    width: dimensions.width,
    height: dimensions.height,
    durationSec: project.durationSec,
    tier: job.type === "GENERATE_FINAL" ? "FINAL" : "PREVIEW",
    language: project.language,
    voiceId: project.voiceId,
    webhookUrl: `${publicEnv.appUrl}/api/webhooks/provider`,
    firstFrameUrl: await firstFrameUrl(project),
  };
}

/**
 * A signed URL for the approved still, handed to the video model as its first
 * frame. This is what makes the render image-to-video rather than
 * text-to-video, and it is the difference between the model animating your
 * composition and reinventing it.
 */
async function firstFrameUrl(project: Project): Promise<string | undefined> {
  if (!project.stillKey) return undefined;
  const url = await signedUrl(project.stillKey);
  // A relative URL is useless to a vendor fetching it from the outside.
  return url.startsWith("http") ? url : `${publicEnv.appUrl}${url}`;
}

/**
 * One row per provider call, success or failure.
 *
 * This table is the only reason we can answer "are we making money?" — it pairs
 * what we charged with what it cost, per generation, forever.
 */
async function recordGeneration(
  job: Job,
  project: Project,
  outcome: {
    success: boolean;
    costUsdMicro?: number;
    latencyMs?: number;
    width?: number;
    height?: number;
    cacheHit?: boolean;
    errorCode?: string;
    errorText?: string;
    /** Overrides for a cache hit, where the job itself never had a provider. */
    provider?: string;
    model?: string;
  },
): Promise<void> {
  await db.generation
    .create({
      data: {
        userId: project.userId,
        projectId: project.id,
        provider: outcome.provider ?? job.providerName ?? "none",
        model: outcome.model ?? readModel(job),
        tier: tierOf(job),
        creditsCharged: job.creditsHeld,
        costUsdMicro: outcome.costUsdMicro ?? 0,
        durationSec: project.durationSec,
        width: outcome.width,
        height: outcome.height,
        latencyMs: outcome.latencyMs,
        success: outcome.success,
        cacheHit: outcome.cacheHit ?? false,
        errorCode: outcome.errorCode,
        errorText: outcome.errorText,
      },
    })
    .catch((error: unknown) => {
      logger.error("worker", "Failed to record generation analytics", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
