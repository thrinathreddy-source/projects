import { getSetting } from "@/lib/settings-catalog";
import type {
  ImageProvider,
  StillRequest,
  StillResult,
} from "@/lib/providers/image-types";

/**
 * Zero-cost still.
 *
 * Draws a composition card rather than pretending to be art: the setting's
 * palette, its accent, and the tags that were actually sent. That makes it
 * useful for the thing it exists to test — whether the lexicon is assembling
 * the right vocabulary — without an API key or a bill.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly label = "Mock still (no cost)";

  isConfigured(): boolean {
    return true;
  }

  estimateCostUsdMicro(): number {
    return 0;
  }

  modelFor(): string {
    return "mock/composition-card";
  }

  async generate(request: StillRequest): Promise<StillResult> {
    const svg = renderCard(request);
    return {
      url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      contentType: "image/svg+xml",
      width: request.width,
      height: request.height,
      sizeBytes: Buffer.byteLength(svg),
      seed: request.seed,
      costUsdMicro: 0,
      model: this.modelFor(),
    };
  }
}

function renderCard(request: StillRequest): string {
  const { width, height } = request;

  // The prompt begins with the quality prefix and the user's sentence; pull a
  // readable fragment out for the card rather than dumping the whole tag list.
  const tags = request.prompt.split(",").map((tag) => tag.trim()).filter(Boolean);
  const headline = tags.slice(4, 10);

  const escape = (value: string) =>
    value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

  // Colour the card from whichever setting's accent appears in the prompt, so
  // different settings are visually distinguishable at a glance.
  const setting =
    [...["dravidian", "mughal", "rajputana", "malabar", "ghats", "chawl", "gully", "himalaya"]]
      .map(getSetting)
      .find((candidate) => request.prompt.includes(candidate.scene.split(",")[0])) ??
    getSetting("dravidian");

  const lines = headline
    .map(
      (tag, index) =>
        `<text x="${width / 2}" y="${height * 0.42 + index * 30}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="19" fill="#f4f4f5" opacity="${0.95 - index * 0.1}">${escape(tag)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${setting.accent}" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#12100e"/>
      <stop offset="100%" stop-color="#0a0908"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${width / 2}" cy="${height * 0.24}" r="${width * 0.16}" fill="${setting.accent}" opacity="0.9"/>
  ${lines}
  <text x="${width / 2}" y="${height - 58}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="${setting.accent}" letter-spacing="2">${escape(setting.label.toUpperCase())}</text>
  <text x="${width / 2}" y="${height - 32}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#71717a">MOCK STILL — SET FAL_KEY FOR REAL ART</text>
</svg>`;
}
