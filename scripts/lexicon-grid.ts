import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { VIDEO_STYLES } from "../src/lib/catalog";
import { SETTINGS } from "../src/lib/settings-catalog";
import { buildImagePrompt } from "../src/lib/catalog";
import { generateStill } from "../src/lib/providers/image-router";
import { usdMicroToInr } from "../src/lib/economics";

/**
 * The experiment that validates or kills the lexicon — `npm run lexicon`.
 *
 * Renders one still for every setting, in a rotating style, against a prompt
 * whose nouns are deliberately generic: "a figure walks past a temple at dawn".
 * If the lexicon works, eight visibly different *places* come back. If it does
 * not, eight variations of Kyoto do, and the positioning needs rethinking
 * before anything else on the launch list matters.
 *
 * Writes the images plus a contact sheet to `.lexicon/`, and reports what it
 * actually spent rather than what we estimated.
 *
 * Costs real money. Roughly the number of cells times the still price — about
 * $0.10 for the default 8, or $0.80 for the full 8x8 matrix with --full.
 */

const OUT = path.join(process.cwd(), ".lexicon");

/**
 * Deliberately vague. Naming a gopuram in the prompt would prove nothing — the
 * question is whether *our* expansion supplies the specificity when the user
 * does not.
 */
const NEUTRAL_PROMPT = "a lone figure walks past a temple at dawn, wide shot";

type Cell = { setting: string; style: string };

function cells(full: boolean): Cell[] {
  if (full) {
    return SETTINGS.flatMap((s) => VIDEO_STYLES.map((v) => ({ setting: s.id, style: v.id })));
  }
  // One row: every setting, rotating through styles so both axes get exercised.
  return SETTINGS.map((s, index) => ({
    setting: s.id,
    style: VIDEO_STYLES[index % VIDEO_STYLES.length].id,
  }));
}

async function main() {
  const full = process.argv.includes("--full");
  const grid = cells(full);

  if (!process.env.FAL_KEY) {
    console.log(
      "\n  FAL_KEY is not set, so this would render mock cards rather than art.\n" +
        "  Add a key to .env and set VIDEO_PROVIDERS=\"fal,mock\" first.\n",
    );
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  console.log(`\n  Rendering ${grid.length} stills into .lexicon/\n`);

  const results: {
    cell: Cell;
    file: string;
    costUsdMicro: number;
    ms: number;
    error?: string;
  }[] = [];

  for (const [index, cell] of grid.entries()) {
    const { prompt, negativePrompt } = buildImagePrompt({
      prompt: NEUTRAL_PROMPT,
      style: cell.style,
      setting: cell.setting,
    });

    const name = `${cell.setting}--${cell.style}`;
    const startedAt = Date.now();

    try {
      const still = await generateStill({
        requestId: `lexicon-${index}`,
        prompt,
        negativePrompt,
        width: 768,
        height: 768,
      });

      const response = await fetch(still.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = still.contentType.includes("png") ? "png" : "jpg";
      const file = `${name}.${extension}`;
      await writeFile(path.join(OUT, file), buffer);

      results.push({ cell, file, costUsdMicro: still.costUsdMicro, ms: Date.now() - startedAt });
      console.log(`  ok   ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ cell, file: "", costUsdMicro: 0, ms: Date.now() - startedAt, error: message });
      console.log(`  FAIL ${name} — ${message}`);
    }
  }

  await writeFile(path.join(OUT, "index.html"), contactSheet(results));

  const spentUsdMicro = results.reduce((total, r) => total + r.costUsdMicro, 0);
  const failed = results.filter((r) => r.error).length;

  console.log(`\n  Spent  $${(spentUsdMicro / 1_000_000).toFixed(3)}  (${usdMicroToInr(spentUsdMicro).toFixed(2)} INR)`);
  console.log(`  Failed ${failed} of ${results.length}`);
  console.log(`\n  Open .lexicon/index.html and answer one question per row:`);
  console.log(`  is this the place it claims to be, or is it Japan?\n`);
}

/** A contact sheet you judge by eye. The whole point is looking at them together. */
function contactSheet(
  results: { cell: Cell; file: string; error?: string }[],
): string {
  const cards = results
    .map(({ cell, file, error }) => {
      const place = SETTINGS.find((s) => s.id === cell.setting);
      const body = error
        ? `<p class="err">${error}</p>`
        : `<img src="${file}" alt="${cell.setting}">`;
      return `<figure>
        ${body}
        <figcaption>
          <strong>${place?.label ?? cell.setting}</strong> · ${cell.style}
          <span>${place?.description ?? ""}</span>
        </figcaption>
      </figure>`;
    })
    .join("\n");

  return `<!doctype html><meta charset="utf-8"><title>Arka · lexicon check</title>
<style>
  body { background:#150f0c; color:#f2e9e1; font:14px/1.5 system-ui,sans-serif; margin:0; padding:32px; }
  h1 { font-size:28px; margin:0 0 4px; }
  p.lead { color:#a89b90; margin:0 0 28px; max-width:60ch; }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); }
  figure { margin:0; background:#1e1613; border:1px solid #3a2c25; }
  img { width:100%; display:block; aspect-ratio:1; object-fit:cover; }
  figcaption { padding:10px 12px; font-size:12px; }
  figcaption strong { color:#e8622e; }
  figcaption span { display:block; color:#8d8078; margin-top:2px; }
  .err { color:#e8622e; padding:24px 12px; font-family:ui-monospace,monospace; font-size:11px; }
</style>
<h1>Does the lexicon work?</h1>
<p class="lead">Every image below came from the same deliberately vague prompt —
&ldquo;${NEUTRAL_PROMPT}&rdquo;. Only the setting changed. If the expansion is
doing its job these are eight different countries&rsquo; worth of architecture.
If they all look like Kyoto, it is not.</p>
<div class="grid">${cards}</div>`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
