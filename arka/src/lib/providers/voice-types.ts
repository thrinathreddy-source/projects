/**
 * The narration contract.
 *
 * Deliberately a separate interface from `VideoProvider` rather than a flag on
 * it: the best text-to-video vendor and the best text-to-speech vendor are
 * rarely the same company, and Indian-language TTS in particular is a market
 * where we will want to switch. Keeping them independent means we can.
 *
 * Unlike video, synthesis is fast enough to await inline, so there is no
 * queue/poll/cancel shape here — just `synthesize`.
 */

export type SynthesisRequest = {
  /** Our job id, for provider-side log correlation. */
  requestId: string;
  /** What the narrator says. Already resolved from script-or-prompt. */
  text: string;
  /** Catalog language id, e.g. "ta". Drives pronunciation and accent. */
  language: string;
  /** Catalog voice id, e.g. "meera". */
  voiceId: string;
  /**
   * Length of the video this narrates. Providers that support pacing use it to
   * avoid narration that runs past the end of the shot.
   */
  targetDurationSec: number;
};

export type SynthesisResult = {
  /** Where the audio can be fetched from, for the life of the request. */
  url: string;
  contentType: string;
  durationSec?: number;
  sizeBytes?: number;
  costUsdMicro: number;
  model: string;
};

export interface VoiceProvider {
  readonly name: string;
  readonly label: string;

  isConfigured(): boolean;

  /** Whether this provider can speak this language in this voice. */
  supports(language: string, voiceId: string): boolean;

  estimateCostUsdMicro(request: SynthesisRequest): number;

  modelFor(request: SynthesisRequest): string;

  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}
