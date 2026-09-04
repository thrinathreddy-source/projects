import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { NO_VOICE } from "@/lib/catalog";
import { MockVoiceProvider } from "@/lib/providers/voice-mock";
import { FalVoiceProvider } from "@/lib/providers/voice-fal";
import { ProviderFailure } from "@/lib/providers/types";
import type {
  SynthesisRequest,
  SynthesisResult,
  VoiceProvider,
} from "@/lib/providers/voice-types";

/**
 * Narration routing.
 *
 * Same shape as the video router — configured, capable, cheapest first, with
 * failover — but a much shorter list, because TTS either works or it does not.
 */

const REGISTRY: readonly VoiceProvider[] = [
  new MockVoiceProvider(),
  new FalVoiceProvider(),
];

/** Reuses VIDEO_PROVIDERS: whichever vendors you trust, you trust for both. */
function preferred(): string[] {
  return env().videoProviders;
}

export function voiceProvidersFor(
  language: string,
  voiceId: string,
): VoiceProvider[] {
  if (voiceId === NO_VOICE) return [];

  const order = preferred();

  return REGISTRY.filter((provider) => order.includes(provider.name))
    .filter((provider) => provider.isConfigured())
    .filter((provider) => provider.supports(language, voiceId))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

export type Narration = SynthesisResult & { provider: string };

export async function synthesize(request: SynthesisRequest): Promise<Narration> {
  const candidates = voiceProvidersFor(request.language, request.voiceId);

  if (candidates.length === 0) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "No narration provider is available for that voice and language.",
    );
  }

  let lastError: ProviderFailure | null = null;

  for (const provider of candidates) {
    try {
      const result = await provider.synthesize(request);
      return { ...result, provider: provider.name };
    } catch (error) {
      const failure =
        error instanceof ProviderFailure
          ? error
          : new ProviderFailure(
              "PROVIDER_FAILED",
              error instanceof Error ? error.message : String(error),
              true,
              error,
            );

      lastError = failure;
      logger.warn("provider", `${provider.name} could not synthesise narration`, {
        code: failure.code,
        message: failure.message,
      });

      if (!failure.retryable) break;
    }
  }

  throw new AppError(
    "PROVIDER_FAILED",
    lastError?.message ?? "Narration failed.",
    { retryable: lastError?.retryable ?? true },
  );
}

/** Cheapest estimate, for the budget guard. */
export function estimateNarrationCost(request: SynthesisRequest): number {
  const candidates = voiceProvidersFor(request.language, request.voiceId);
  if (candidates.length === 0) return 0;

  return Math.min(
    ...candidates.map((provider) => provider.estimateCostUsdMicro(request)),
  );
}
