import { fal } from "@fal-ai/client";
import { env } from "@/lib/env";
import { getVoice } from "@/lib/catalog";
import { ProviderFailure } from "@/lib/providers/types";
import type {
  SynthesisRequest,
  SynthesisResult,
  VoiceProvider,
} from "@/lib/providers/voice-types";

/**
 * fal.ai text-to-speech.
 *
 * Endpoint id is env-overridable because TTS models turn over faster than video
 * models, and Indian-language coverage is exactly where that churn happens.
 * Verify `FAL_TTS_MODEL` against fal's catalog before going live.
 */

const MODEL = process.env.FAL_TTS_MODEL || "fal-ai/minimax/speech-02-turbo";

/** Estimated USD micros per second of generated speech. Over-estimate on
 *  purpose: this feeds the daily budget guard. */
const COST_USD_MICRO_PER_SECOND = 1_200;

let configured = false;

function configure() {
  if (configured) return;
  fal.config({ credentials: env().FAL_KEY });
  configured = true;
}

export class FalVoiceProvider implements VoiceProvider {
  readonly name = "fal";
  readonly label = "fal.ai speech";

  isConfigured(): boolean {
    return env().hasFal;
  }

  supports(language: string, voiceId: string): boolean {
    const voice = getVoice(voiceId);
    if (!voice || voice.id === "none") return false;
    // An empty `languages` list means the voice is language-agnostic.
    return voice.languages.length === 0 || voice.languages.includes(language);
  }

  modelFor(): string {
    return MODEL;
  }

  estimateCostUsdMicro(request: SynthesisRequest): number {
    return Math.ceil(COST_USD_MICRO_PER_SECOND * request.targetDurationSec);
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    configure();
    const voice = getVoice(request.voiceId);

    try {
      const result = await fal.subscribe(MODEL, {
        input: {
          text: request.text,
          // Catalog voices carry the vendor-side identifier, so renaming a
          // voice in our UI never breaks a render.
          voice_setting: {
            voice_id: voice?.providerVoiceId ?? "Wise_Woman",
            speed: 1,
          },
          language_boost: request.language,
        },
      });

      const data = result.data as FalAudioOutput;
      const url = data.audio?.url;

      if (!url) {
        throw new ProviderFailure(
          "NO_OUTPUT",
          `${MODEL} returned no audio.`,
          true,
        );
      }

      return {
        url,
        contentType: data.audio?.content_type || "audio/mpeg",
        durationSec: data.duration_ms ? Math.round(data.duration_ms / 1000) : undefined,
        sizeBytes: data.audio?.file_size,
        costUsdMicro: this.estimateCostUsdMicro(request),
        model: MODEL,
      };
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;

      const status = extractStatus(error);
      const retryable = status === undefined || status === 429 || status >= 500;

      throw new ProviderFailure(
        retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_FAILED",
        error instanceof Error ? error.message : "Speech synthesis failed.",
        retryable,
        error,
      );
    }
  }
}

type FalAudioOutput = {
  audio?: { url?: string; content_type?: string; file_size?: number };
  duration_ms?: number;
};

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" ? value : undefined;
}
