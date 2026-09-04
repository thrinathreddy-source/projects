import { fal } from "@fal-ai/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ProviderFailure } from "@/lib/providers/types";
import type {
  ImageProvider,
  StillRequest,
  StillResult,
} from "@/lib/providers/image-types";

/**
 * fal.ai adapter for the still stage.
 *
 * Model choice here is the single biggest quality lever in the product. These
 * are anime-specialised checkpoints — Illustrious XL and its NoobAI descendants
 * are trained on Danbooru-tagged illustration, which is why `catalog.ts` sends
 * comma-separated tags rather than prose. A general-purpose image model will
 * produce something competent and generic; these produce something that looks
 * drawn.
 *
 * Cost is roughly two orders of magnitude below a video render, which is the
 * whole economic argument for the two-stage pipeline: iterate here, commit to
 * motion once.
 *
 * There is no dedicated `fal-ai/illustrious` endpoint — that was an assumption,
 * and probing fal's live API returned 404 for it and for every other obvious
 * anime-checkpoint id. The actual mechanism is `fal-ai/lora`, fal's SDXL runner,
 * which loads an arbitrary checkpoint by name. So the anime model is a *config*
 * value, not an endpoint: point `FAL_STILL_CHECKPOINT` at an Illustrious or
 * NoobAI repo and the same endpoint becomes an anime model.
 *
 * Without that variable set we fall back to plain SDXL, which works and looks
 * generic. That fallback is deliberate — it keeps a fresh clone running — but
 * shipping on it would forfeit the entire quality argument for stage one.
 */

type ModelSpec = {
  endpointId: string;
  /** Best-known USD micros per image. Drives routing and the budget guard. */
  costUsdMicro: number;
};

/** Verified to exist via `npm run probe:fal`. */
const CHECKPOINT_RUNNER = "fal-ai/lora";
const PLAIN_SDXL = "fal-ai/fast-sdxl";

/**
 * An anime checkpoint on HuggingFace or a direct `.safetensors` URL, e.g.
 * "OnomaAIResearch/Illustrious-xl-early-release-v0". Unset means plain SDXL.
 */
const CHECKPOINT = process.env.FAL_STILL_CHECKPOINT || "";

const MODEL: ModelSpec = {
  endpointId:
    process.env.FAL_STILL_MODEL || (CHECKPOINT ? CHECKPOINT_RUNNER : PLAIN_SDXL),
  costUsdMicro: 12_000, // ~$0.012 per image
};

let configured = false;

function configure() {
  if (configured) return;
  fal.config({ credentials: env().FAL_KEY });
  configured = true;
}

export class FalImageProvider implements ImageProvider {
  readonly name = "fal";
  readonly label = CHECKPOINT ? "fal.ai (anime checkpoint)" : "fal.ai (plain SDXL)";

  isConfigured(): boolean {
    return env().hasFal;
  }

  estimateCostUsdMicro(): number {
    return MODEL.costUsdMicro;
  }

  /** Records the checkpoint, not just the runner — otherwise every anime model
   *  logs identically as "fal-ai/lora" and per-model analytics are useless. */
  modelFor(): string {
    return CHECKPOINT ? `${MODEL.endpointId}:${CHECKPOINT}` : MODEL.endpointId;
  }

  async generate(request: StillRequest): Promise<StillResult> {
    configure();

    try {
      const result = await fal.subscribe(MODEL.endpointId, {
        input: {
          prompt: request.prompt,
          negative_prompt: request.negativePrompt,
          image_size: { width: request.width, height: request.height },
          num_images: 1,
          // Only the checkpoint runner accepts a model name; plain SDXL rejects
          // unknown keys, so this stays absent unless it is actually wanted.
          ...(CHECKPOINT ? { model_name: CHECKPOINT } : {}),
          // Anime checkpoints are tuned for a fairly high step count and a
          // moderate guidance scale; pushing guidance higher burns the colours
          // and is a common way to make output look "AI".
          num_inference_steps: 28,
          guidance_scale: 5.5,
          ...(request.seed === undefined ? {} : { seed: request.seed }),
          enable_safety_checker: true,
        },
      });

      const data = result.data as FalImageOutput;
      const image = data.images?.[0];

      if (!image?.url) {
        throw new ProviderFailure(
          "NO_OUTPUT",
          `${MODEL.endpointId} returned no image.`,
          true,
        );
      }

      /**
       * Fail closed on the vendor's own verdict.
       *
       * Terminal, not retryable: the same prompt and seed will produce the
       * same flagged image, so a retry is three more vendor bills for the
       * same refusal. The queue refunds the credits on a terminal failure,
       * which is the right outcome — the user gets nothing and pays nothing.
       *
       * The prompt is not logged. Storing the text that produced flagged
       * output creates a liability rather than removing one.
       */
      if (data.has_nsfw_concepts?.[0]) {
        logger.warn("provider", "Discarded a still the safety checker flagged", {
          requestId: request.requestId,
          model: MODEL.endpointId,
        });

        throw new ProviderFailure(
          "SAFETY_BLOCKED",
          "That render came back outside our content policy, so it was discarded. Your credits have been returned. Try describing the scene differently.",
          false,
        );
      }

      return {
        url: image.url,
        contentType: image.content_type || "image/png",
        width: image.width,
        height: image.height,
        sizeBytes: image.file_size,
        seed: data.seed,
        costUsdMicro: MODEL.costUsdMicro,
        model: MODEL.endpointId,
      };
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      throw toProviderFailure(error);
    }
  }
}

type FalImageOutput = {
  images?: {
    url?: string;
    content_type?: string;
    width?: number;
    height?: number;
    file_size?: number;
  }[];
  seed?: number;
  /**
   * One flag per returned image, from the classifier `enable_safety_checker`
   * switches on. We asked for this from the first version and then never read
   * it, which made the whole safety checker decorative.
   */
  has_nsfw_concepts?: boolean[];
};

/** Same retryable/terminal split the video adapter uses. */
function toProviderFailure(error: unknown): ProviderFailure {
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
    return new ProviderFailure("AUTH_FAILED", "fal.ai rejected our credentials.", false, error);
  }
  if (status === 400 || status === 422) {
    return new ProviderFailure(
      "INVALID_REQUEST",
      "fal.ai rejected the image parameters.",
      false,
      error,
    );
  }
  if (status === undefined) {
    return new ProviderFailure("NETWORK", "Could not reach fal.ai.", true, error);
  }
  return new ProviderFailure("PROVIDER_FAILED", message, false, error);
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" ? value : undefined;
}
