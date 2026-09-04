import { getStyle } from "@/lib/catalog";
import type {
  GenerateRequest,
  GenerateResult,
  ProviderStatus,
  VideoProvider,
} from "@/lib/providers/types";

/**
 * The zero-cost provider.
 *
 * Its job is to make the whole workflow — queue, lease, progress polling,
 * storage upload, signed URL, playback, download, credit settlement — provably
 * work before a single rupee reaches a model vendor. It is also the fallback
 * used in CI and by anyone cloning the repo.
 *
 * There is no video encoder in this process, so rather than fabricate MP4
 * bytes the mock emits a genuinely animated SVG rendered from the request's
 * own parameters. It travels the identical path a real render takes; the
 * player falls back to an image when the stored asset is not a video.
 */

/** How long a fake render "takes", so progress polling has something to show. */
const RENDER_MS = 9_000;

/** Handle format: `mock_<startedAtMs>_<base64url of the request>`. */
function encodeHandle(request: GenerateRequest): string {
  const payload = Buffer.from(
    JSON.stringify({
      prompt: request.prompt,
      style: request.style,
      width: request.width,
      height: request.height,
      durationSec: request.durationSec,
    }),
  ).toString("base64url");

  return `mock_${Date.now()}_${payload}`;
}

function decodeHandle(handle: string) {
  const [, startedAt, payload] = handle.split("_");
  const started = Number(startedAt);

  let request = { prompt: "", style: "mythic", width: 576, height: 1024, durationSec: 5 };
  try {
    request = { ...request, ...JSON.parse(Buffer.from(payload, "base64url").toString()) };
  } catch {
    // A malformed handle still yields a usable placeholder rather than a crash.
  }

  return { startedAt: Number.isFinite(started) ? started : Date.now(), request };
}

const cancelled = new Set<string>();

export class MockProvider implements VideoProvider {
  readonly name = "mock";
  readonly label = "Mock (no cost)";

  isConfigured(): boolean {
    return true;
  }

  supports(): boolean {
    return true;
  }

  estimateCostUsdMicro(): number {
    return 0;
  }

  modelFor(): string {
    return "mock/animated-placeholder";
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    return { providerJobId: encodeHandle(request), state: "queued" };
  }

  async status(providerJobId: string): Promise<ProviderStatus> {
    if (cancelled.has(providerJobId)) {
      return { state: "cancelled", progress: 0 };
    }

    const { startedAt, request } = decodeHandle(providerJobId);
    const elapsed = Date.now() - startedAt;

    if (elapsed < RENDER_MS) {
      const progress = Math.min(95, Math.round((elapsed / RENDER_MS) * 100));
      return { state: elapsed < 1_500 ? "queued" : "running", progress };
    }

    const svg = renderPlaceholder(request);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

    return {
      state: "succeeded",
      progress: 100,
      costUsdMicro: 0,
      video: {
        url: dataUrl,
        contentType: "image/svg+xml",
        width: request.width,
        height: request.height,
        durationSec: request.durationSec,
        sizeBytes: Buffer.byteLength(svg),
      },
      thumbnail: {
        url: dataUrl,
        contentType: "image/svg+xml",
        width: request.width,
        height: request.height,
      },
    };
  }

  async cancel(providerJobId: string): Promise<void> {
    cancelled.add(providerJobId);
  }
}

/**
 * Draw the placeholder. Deliberately styled from the same catalog entry the
 * real render would use, so the mock looks like a member of the product rather
 * than a grey box.
 */
function renderPlaceholder(request: {
  prompt: string;
  style: string;
  width: number;
  height: number;
  durationSec: number;
}): string {
  const style = getStyle(request.style);
  const { width, height } = request;

  const words = request.prompt.split(/\s+/).filter(Boolean).slice(0, 14);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > 26) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());

  const escape = (value: string) =>
    value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

  const textBlock = lines
    .slice(0, 5)
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${height * 0.58 + index * 34}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" fill="#f4f4f5" opacity="0.92">${escape(line)}</text>`,
    )
    .join("");

  const sunY = height * 0.36;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#12121a"/>
      <stop offset="55%" stop-color="${style.accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#08080c"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${style.accent}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${style.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#sky)"/>
  <circle cx="${width / 2}" cy="${sunY}" r="${width * 0.42}" fill="url(#glow)">
    <animate attributeName="r" values="${width * 0.38};${width * 0.46};${width * 0.38}" dur="4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${width / 2}" cy="${sunY}" r="${width * 0.14}" fill="${style.accent}">
    <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite"/>
  </circle>

  <g stroke="${style.accent}" stroke-opacity="0.25" stroke-width="2">
    <line x1="0" y1="${height * 0.72}" x2="${width}" y2="${height * 0.72}"/>
    <line x1="0" y1="${height * 0.78}" x2="${width}" y2="${height * 0.78}"/>
  </g>

  ${textBlock}

  <text x="${width / 2}" y="${height - 56}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#a1a1aa" letter-spacing="2">${escape(style.label.toUpperCase())} · ${request.durationSec}s</text>
  <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#71717a">MOCK RENDER — SET FAL_KEY FOR REAL VIDEO</text>
</svg>`;
}
