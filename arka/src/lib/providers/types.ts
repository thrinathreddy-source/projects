/**
 * The provider contract.
 *
 * Arka does not train or host models. It orchestrates other people's — which
 * means the single most valuable property of this codebase is that swapping
 * the model vendor is a config change, not a rewrite. Everything a provider
 * needs to know arrives in `GenerateRequest`; everything the rest of the app
 * needs back arrives in `ProviderStatus`. No provider SDK type is allowed to
 * escape this directory.
 */

export type RenderTier = "PREVIEW" | "FINAL";

export type GenerateRequest = {
  /** Our job id. Passed through so provider logs correlate with ours. */
  requestId: string;
  /** Fully assembled prompt, style scaffolding already applied. */
  prompt: string;
  negativePrompt: string;
  /** Catalog style id, for providers that expose style presets natively. */
  style: string;
  aspectRatio: string;
  width: number;
  height: number;
  durationSec: number;
  tier: RenderTier;
  language: string;
  voiceId: string;
  /** Absolute URL a provider may call on completion, when it supports it. */
  webhookUrl?: string;
  /**
   * The approved still, as an absolute URL. Its presence is what makes this an
   * image-to-video render: the model animates a composition that is already
   * correct instead of inventing one from the prompt every run.
   */
  firstFrameUrl?: string;
};

export type ProviderState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type ProviderError = {
  code: string;
  message: string;
  /** Whether the queue should try again rather than refund and give up. */
  retryable: boolean;
};

export type GenerateResult = {
  /** Opaque handle used for `status` and `cancel`. */
  providerJobId: string;
  state: ProviderState;
};

export type ProviderAsset = {
  /** Where the finished file can be fetched from, for the duration of the job. */
  url: string;
  contentType: string;
  width?: number;
  height?: number;
  durationSec?: number;
  sizeBytes?: number;
};

export type ProviderStatus = {
  state: ProviderState;
  /** 0-100. Providers that do not report progress return a coarse estimate. */
  progress: number;
  video?: ProviderAsset;
  thumbnail?: ProviderAsset;
  /**
   * Actual spend, when the provider reports it. Falls back to our estimate,
   * which is why `Generation.costUsdMicro` is described as best-known cost.
   */
  costUsdMicro?: number;
  error?: ProviderError;
};

export interface VideoProvider {
  /** Stable identifier, stored on every Generation row. */
  readonly name: string;

  /** Human label for the admin UI. */
  readonly label: string;

  /** False when credentials are missing; the router skips it entirely. */
  isConfigured(): boolean;

  /** Whether this provider can serve the request at all (duration, ratio, ...). */
  supports(request: GenerateRequest): boolean;

  /** Best-effort cost in USD micros, used for routing and the budget guard. */
  estimateCostUsdMicro(request: GenerateRequest): number;

  /** Model identifier that would serve this request, recorded for analytics. */
  modelFor(request: GenerateRequest): string;

  generate(request: GenerateRequest): Promise<GenerateResult>;
  status(providerJobId: string): Promise<ProviderStatus>;
  cancel(providerJobId: string): Promise<void>;
}

/** Thrown by adapters so the router can distinguish transient from terminal. */
export class ProviderFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false, cause?: unknown) {
    super(message, { cause });
    this.name = "ProviderFailure";
    this.code = code;
    this.retryable = retryable;
  }
}
