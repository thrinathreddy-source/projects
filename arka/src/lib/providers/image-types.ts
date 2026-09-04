/**
 * The still contract.
 *
 * A third vendor interface, separate from video and voice for the same reason
 * those are separate from each other: the best anime *image* model and the best
 * anime *video* model are not the same company, and almost certainly never will
 * be. Image models are trained on tens of millions of tagged anime
 * illustrations; video models are trained mostly on real footage and approximate
 * anime as a thin slice of it.
 *
 * Synthesis is fast and cheap enough to await inline, so there is no
 * queue/poll/cancel shape here — just `generate`.
 */

export type StillRequest = {
  /** Our job id, for provider-side log correlation. */
  requestId: string;
  /** Fully assembled tag prompt, lexicon already applied. */
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  /**
   * Set when re-rolling, so the user gets a genuinely different image rather
   * than the same one back. Omitted on the first attempt.
   */
  seed?: number;
};

export type StillResult = {
  /** Where the image can be fetched from, for the life of the request. */
  url: string;
  contentType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  seed?: number;
  costUsdMicro: number;
  model: string;
};

export interface ImageProvider {
  readonly name: string;
  readonly label: string;

  isConfigured(): boolean;

  estimateCostUsdMicro(request: StillRequest): number;

  modelFor(request: StillRequest): string;

  generate(request: StillRequest): Promise<StillResult>;
}
