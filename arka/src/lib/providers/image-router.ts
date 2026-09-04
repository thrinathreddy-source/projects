import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { FalImageProvider } from "@/lib/providers/image-fal";
import { MockImageProvider } from "@/lib/providers/image-mock";
import type {
  ImageProvider,
  StillRequest,
  StillResult,
} from "@/lib/providers/image-types";

/**
 * Still routing.
 *
 * Same shape as the video and voice routers: configured providers in preference
 * order, cheapest capable one wins, mock is the always-available floor so the
 * pipeline runs with no keys at all.
 */

const REGISTRY: readonly ImageProvider[] = [new MockImageProvider(), new FalImageProvider()];

function available(): ImageProvider[] {
  const preferred = env().videoProviders; // one env var governs vendor choice
  return REGISTRY.filter(
    (provider) => preferred.includes(provider.name) && provider.isConfigured(),
  ).sort(
    (a, b) => preferred.indexOf(a.name) - preferred.indexOf(b.name),
  );
}

export function estimateStillCost(request: StillRequest): number {
  const [provider] = available();
  return provider ? provider.estimateCostUsdMicro(request) : 0;
}

export type StillOutcome = StillResult & { provider: string };

export async function generateStill(request: StillRequest): Promise<StillOutcome> {
  const providers = available();

  if (providers.length === 0) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "No image provider is available right now.",
      { retryable: true },
    );
  }

  let lastError: unknown;

  for (const provider of providers) {
    try {
      const result = await provider.generate(request);
      return { ...result, provider: provider.name };
    } catch (error) {
      lastError = error;
      logger.warn("provider", `${provider.name} could not render a still`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new AppError(
    "PROVIDER_FAILED",
    lastError instanceof Error ? lastError.message : "Every image provider failed.",
    { retryable: true },
  );
}
