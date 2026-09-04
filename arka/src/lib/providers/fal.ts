import { fal } from "@fal-ai/client";
import { env } from "@/lib/env";
import { getAspectRatio } from "@/lib/catalog";
import {
  ProviderFailure,
  type GenerateRequest,
  type GenerateResult,
  type ProviderAsset,
  type ProviderStatus,
  type VideoProvider,
} from "@/lib/providers/types";

/**
 * fal.ai adapter.
 *
 * fal is the cheapest way to reach good text-to-video today and exposes an
 * async queue, which maps cleanly onto our own job queue: submit, poll, fetch.
 * Nothing outside this file knows fal exists.
 */

type ModelSpec = {
  /** Used only when there is no still to condition on. */
  textToVideo: string;
  /**
   * Used whenever a still exists — which, since the two-stage rewrite, is
   * nearly always.
   *
   * This distinction is load-bearing. Passing `image_url` to a text-to-video
   * endpoint conditions nothing: the parameter is ignored and the model
   * reinvents the composition from the prompt, which is exactly the drift the
   * two-stage pipeline exists to prevent. Both variants were verified to exist
   * against fal's live API.
   */
  imageToVideo: string;
  /**
   * Estimated USD micros per second of output.
   *
   * This drives routing and the daily budget guard, not billing, so an
   * approximation is fine — but it must be an over-estimate rather than an
   * under-estimate, since the budget guard is a safety mechanism. True these up
   * against a real fal invoice; `npm run reconcile` reports the gap.
   */
  costUsdMicroPerSecond: number;
  maxDurationSec: number;
};

/**
 * Model selection, at August 2026 list prices.
 *
 * Endpoint ids are verified with `npm run probe:fal`, which distinguishes
 * "endpoint does not exist" (404) from "not authenticated" (401) and therefore
 * needs no API key. Re-run it after any vendor announcement — ids get renamed
 * and retired constantly, and a stale one fails only at dispatch, after the
 * user has already been charged.
 *
 * Model choice here is specifically an *anime* decision, not a general-quality
 * one. Wan keeps linework inked and shading flat through motion, which is the
 * property we care about; several more expensive models produce a smoother,
 * more photoreal result that is actively worse for this product.
 */
const MODELS: Record<"PREVIEW" | "FINAL", ModelSpec> = {
  // The default, and what most output ships as. Cheapest credible anime model
  // at native 1080p, which is why the economics work at all.
  PREVIEW: {
    textToVideo: process.env.FAL_PREVIEW_MODEL || "fal-ai/wan/v2.6/text-to-video",
    imageToVideo:
      process.env.FAL_PREVIEW_I2V_MODEL || "fal-ai/wan/v2.6/image-to-video",
    costUsdMicroPerSecond: 50_000, // $0.05/s
    maxDurationSec: 10,
  },
  // Better motion and markedly better character consistency across a shot.
  // Roughly double the cost, so it is opt-in per project.
  FINAL: {
    textToVideo:
      process.env.FAL_FINAL_MODEL || "fal-ai/kling-video/v3/standard/text-to-video",
    imageToVideo:
      process.env.FAL_FINAL_I2V_MODEL ||
      "fal-ai/kling-video/v3/standard/image-to-video",
    costUsdMicroPerSecond: 100_000, // $0.10/s
    maxDurationSec: 15,
  },
};

/** The endpoint that will actually honour whatever conditioning we have. */
function endpointFor(request: GenerateRequest): string {
  const spec = MODELS[request.tier];
  return request.firstFrameUrl ? spec.imageToVideo : spec.textToVideo;
}

/** Handle format: `<endpointId>::<falRequestId>` — status/cancel need both. */
function encodeHandle(endpointId: string, requestId: string) {
  return `${endpointId}::${requestId}`;
}

function decodeHandle(handle: string): { endpointId: string; requestId: string } {
  const separator = handle.lastIndexOf("::");
  if (separator === -1) {
    throw new ProviderFailure("BAD_HANDLE", "Malformed fal job handle.", false);
  }
  return {
    endpointId: handle.slice(0, separator),
    requestId: handle.slice(separator + 2),
  };
}

let configured = false;

function configure() {
  if (configured) return;
  fal.config({ credentials: env().FAL_KEY });
  configured = true;
}

export class FalProvider implements VideoProvider {
  readonly name = "fal";
  readonly label = "fal.ai";

  isConfigured(): boolean {
    return env().hasFal;
  }

  supports(request: GenerateRequest): boolean {
    return request.durationSec <= MODELS[request.tier].maxDurationSec;
  }

  modelFor(request: GenerateRequest): string {
    return endpointFor(request);
  }

  estimateCostUsdMicro(request: GenerateRequest): number {
    return Math.ceil(MODELS[request.tier].costUsdMicroPerSecond * request.durationSec);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    configure();
    const endpoint = endpointFor(request);
    const ratio = getAspectRatio(request.aspectRatio);

    try {
      const queued = await fal.queue.submit(endpoint, {
        input: {
          prompt: request.prompt,
          negative_prompt: request.negativePrompt,
          aspect_ratio: ratio.ratio,
          duration: request.durationSec,
          // Preview renders deliberately stay small; the point of a preview is
          // to answer "is this the right shot?" for as little money as possible.
          resolution: request.tier === "PREVIEW" ? "480p" : "720p",
          // Image-to-video when we have an approved still. Conditioning on a
          // frame is the only reliable fix for style and character drift; no
          // amount of prompt tuning substitutes for it.
          ...(request.firstFrameUrl ? { image_url: request.firstFrameUrl } : {}),
        },
        webhookUrl: request.webhookUrl,
      });

      return {
        providerJobId: encodeHandle(endpoint, queued.request_id),
        state: "queued",
      };
    } catch (error) {
      throw toProviderFailure(error, "submit");
    }
  }

  async status(providerJobId: string): Promise<ProviderStatus> {
    configure();
    const { endpointId, requestId } = decodeHandle(providerJobId);

    let queueStatus;
    try {
      queueStatus = await fal.queue.status(endpointId, { requestId, logs: false });
    } catch (error) {
      const failure = toProviderFailure(error, "status");
      // A transient status read must not fail the job — report it as still
      // running and let the queue's own timeout be the arbiter.
      if (failure.retryable) return { state: "running", progress: 30 };
      return {
        state: "failed",
        progress: 0,
        error: { code: failure.code, message: failure.message, retryable: false },
      };
    }

    if (queueStatus.status === "IN_QUEUE") {
      return { state: "queued", progress: 5 };
    }

    if (queueStatus.status === "IN_PROGRESS") {
      // fal does not report a percentage; a fixed midpoint is more honest than
      // a fabricated curve, and the UI shows an indeterminate bar anyway.
      return { state: "running", progress: 50 };
    }

    // COMPLETED covers both success and failure — the result call is what
    // distinguishes them.
    try {
      const result = await fal.queue.result(endpointId, { requestId });
      return toSuccessStatus(result.data as FalVideoOutput, endpointId);
    } catch (error) {
      const failure = toProviderFailure(error, "result");
      return {
        state: "failed",
        progress: 0,
        error: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
      };
    }
  }

  async cancel(providerJobId: string): Promise<void> {
    configure();
    const { endpointId, requestId } = decodeHandle(providerJobId);
    try {
      await fal.queue.cancel(endpointId, { requestId });
    } catch {
      // A job that already finished cannot be cancelled. That is not an error
      // worth surfacing — the caller's intent (stop billing for it) is moot.
    }
  }
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

/**
 * The overlapping subset of fal's text-to-video outputs. Different endpoints
 * return slightly different envelopes, so every field is optional and read
 * defensively.
 */
type FalVideoOutput = {
  video?: { url?: string; content_type?: string; file_size?: number };
  thumbnail?: { url?: string; content_type?: string };
  image?: { url?: string; content_type?: string };
  seed?: number;
};

function toSuccessStatus(data: FalVideoOutput, endpointId: string): ProviderStatus {
  const url = data.video?.url;

  if (!url) {
    return {
      state: "failed",
      progress: 0,
      error: {
        code: "NO_OUTPUT",
        message: `${endpointId} completed without returning a video.`,
        retryable: true,
      },
    };
  }

  const video: ProviderAsset = {
    url,
    contentType: data.video?.content_type || "video/mp4",
    sizeBytes: data.video?.file_size,
  };

  const thumbnailUrl = data.thumbnail?.url ?? data.image?.url;

  return {
    state: "succeeded",
    progress: 100,
    video,
    thumbnail: thumbnailUrl
      ? {
          url: thumbnailUrl,
          contentType: data.thumbnail?.content_type ?? "image/jpeg",
        }
      : undefined,
  };
}

/**
 * Map an SDK error onto our retryable/terminal split.
 *
 * Getting this wrong is expensive in both directions: retrying a terminal
 * failure burns money, and giving up on a transient one burns a customer.
 */
function toProviderFailure(error: unknown, phase: string): ProviderFailure {
  const status = extractStatus(error);
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    return new ProviderFailure("RATE_LIMITED", "fal.ai rate limit hit.", true, error);
  }
  if (status !== undefined && status >= 500) {
    return new ProviderFailure(
      "PROVIDER_UNAVAILABLE",
      "fal.ai is having trouble right now.",
      true,
      error,
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderFailure(
      "AUTH_FAILED",
      "fal.ai rejected our credentials.",
      false,
      error,
    );
  }
  if (status === 422 || status === 400) {
    return new ProviderFailure(
      "INVALID_REQUEST",
      "fal.ai rejected the request parameters.",
      false,
      error,
    );
  }

  // No status at all usually means the network call never completed.
  if (status === undefined) {
    return new ProviderFailure(
      "NETWORK",
      `Could not reach fal.ai during ${phase}.`,
      true,
      error,
    );
  }

  return new ProviderFailure("PROVIDER_FAILED", message, false, error);
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" ? value : undefined;
}
