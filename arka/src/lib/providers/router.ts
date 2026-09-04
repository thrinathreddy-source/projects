import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { MockProvider } from "@/lib/providers/mock";
import { FalProvider } from "@/lib/providers/fal";
import {
  ProviderFailure,
  type GenerateRequest,
  type VideoProvider,
} from "@/lib/providers/types";

/**
 * Provider routing.
 *
 * The model market moves faster than we can ship. Rather than couple the
 * product to one vendor, every request goes through this router, which picks
 * from the configured providers by cost, capability and current health, and
 * fails over when the first choice is unavailable.
 *
 * Selection order:
 *   1. Configured (credentials present) and capable of the request.
 *   2. Healthy — not inside a failure backoff window.
 *   3. Cheapest estimated cost, with the VIDEO_PROVIDERS order as tiebreak.
 */

const REGISTRY: readonly VideoProvider[] = [new MockProvider(), new FalProvider()];

const BY_NAME = new Map(REGISTRY.map((provider) => [provider.name, provider]));

export function getProvider(name: string): VideoProvider {
  const provider = BY_NAME.get(name);
  if (!provider) {
    throw new AppError("PROVIDER_UNAVAILABLE", `Unknown provider "${name}".`);
  }
  return provider;
}

export function allProviders(): readonly VideoProvider[] {
  return REGISTRY;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Backoff after consecutive failures, in seconds. The first couple of failures
 * are treated as noise — a provider is only taken out of rotation once the
 * failures look systemic.
 */
function disableSeconds(consecutiveFailures: number): number {
  if (consecutiveFailures < 3) return 0;
  if (consecutiveFailures === 3) return 60;
  if (consecutiveFailures === 4) return 300;
  return 900;
}

export async function recordSuccess(name: string): Promise<void> {
  await db.providerHealth.upsert({
    where: { name },
    create: { name, healthy: true, consecutiveFailures: 0 },
    update: {
      healthy: true,
      consecutiveFailures: 0,
      disabledUntil: null,
      lastCheckedAt: new Date(),
      lastError: null,
    },
  });
}

export async function recordFailure(name: string, error: string): Promise<void> {
  const current = await db.providerHealth.findUnique({ where: { name } });
  const failures = (current?.consecutiveFailures ?? 0) + 1;
  const backoff = disableSeconds(failures);

  await db.providerHealth.upsert({
    where: { name },
    create: {
      name,
      healthy: backoff === 0,
      consecutiveFailures: failures,
      lastError: error,
      disabledUntil: backoff ? new Date(Date.now() + backoff * 1000) : null,
    },
    update: {
      healthy: backoff === 0,
      consecutiveFailures: failures,
      lastError: error,
      lastCheckedAt: new Date(),
      disabledUntil: backoff ? new Date(Date.now() + backoff * 1000) : null,
    },
  });

  if (backoff > 0) {
    logger.warn("provider", `Taking ${name} out of rotation for ${backoff}s`, {
      failures,
      error,
    });
  }
}

async function unhealthyNames(): Promise<Set<string>> {
  const rows = await db.providerHealth.findMany({
    where: { disabledUntil: { gt: new Date() } },
    select: { name: true },
  });
  return new Set(rows.map((row) => row.name));
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type Candidate = {
  provider: VideoProvider;
  model: string;
  estimatedCostUsdMicro: number;
};

/**
 * Ordered list of providers that could serve this request, cheapest first.
 * Returns an empty array when nothing is available.
 */
export async function candidatesFor(request: GenerateRequest): Promise<Candidate[]> {
  const preferred = env().videoProviders;
  const unhealthy = await unhealthyNames();

  return REGISTRY.filter((provider) => preferred.includes(provider.name))
    .filter((provider) => provider.isConfigured())
    .filter((provider) => provider.supports(request))
    .filter((provider) => !unhealthy.has(provider.name))
    .map((provider) => ({
      provider,
      model: provider.modelFor(request),
      estimatedCostUsdMicro: provider.estimateCostUsdMicro(request),
    }))
    .sort((a, b) => {
      const byCost = a.estimatedCostUsdMicro - b.estimatedCostUsdMicro;
      if (byCost !== 0) return byCost;
      return preferred.indexOf(a.provider.name) - preferred.indexOf(b.provider.name);
    });
}

/** Cheapest available estimate, used by the budget guard before enqueueing. */
export async function estimateCost(request: GenerateRequest): Promise<number> {
  const candidates = await candidatesFor(request);
  return candidates[0]?.estimatedCostUsdMicro ?? 0;
}

export type Dispatch = {
  providerName: string;
  model: string;
  providerJobId: string;
  estimatedCostUsdMicro: number;
};

/**
 * Submit to the best available provider, failing over on transient errors.
 *
 * A terminal failure (bad credentials, invalid parameters) stops the loop —
 * retrying an identical request against a second provider that will reject it
 * the same way just wastes time. A transient one moves to the next candidate.
 */
export async function dispatch(request: GenerateRequest): Promise<Dispatch> {
  const candidates = await candidatesFor(request);

  if (candidates.length === 0) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "No video provider is available for these settings right now.",
      { retryable: true },
    );
  }

  let lastError: ProviderFailure | null = null;

  for (const candidate of candidates) {
    try {
      const result = await candidate.provider.generate(request);
      await recordSuccess(candidate.provider.name);

      return {
        providerName: candidate.provider.name,
        model: candidate.model,
        providerJobId: result.providerJobId,
        estimatedCostUsdMicro: candidate.estimatedCostUsdMicro,
      };
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
      await recordFailure(candidate.provider.name, failure.message);

      logger.warn("provider", `${candidate.provider.name} failed to accept a job`, {
        code: failure.code,
        retryable: failure.retryable,
        message: failure.message,
      });

      if (!failure.retryable) break;
    }
  }

  throw new AppError(
    "PROVIDER_FAILED",
    lastError?.message ?? "Every provider refused the job.",
    { retryable: lastError?.retryable ?? true },
  );
}

/** Provider status for the admin dashboard. */
export async function providerHealthReport() {
  const health = await db.providerHealth.findMany();
  const byName = new Map(health.map((row) => [row.name, row]));
  const preferred = env().videoProviders;

  return REGISTRY.map((provider) => {
    const row = byName.get(provider.name);
    const disabled = row?.disabledUntil && row.disabledUntil > new Date();

    return {
      name: provider.name,
      label: provider.label,
      configured: provider.isConfigured(),
      enabled: preferred.includes(provider.name),
      healthy: !disabled,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      disabledUntil: disabled ? row?.disabledUntil ?? null : null,
      lastError: row?.lastError ?? null,
    };
  });
}
