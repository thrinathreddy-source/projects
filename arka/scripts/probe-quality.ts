import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildImagePrompt, buildMotionPrompt, getStyle } from "../src/lib/catalog";
import { generateStill } from "../src/lib/providers/image-router";
import { dispatch, getProvider } from "../src/lib/providers";
import { postProcess } from "../src/lib/mux";
import { fetchAsset } from "../src/lib/storage";
import { usdMicroToInr } from "../src/lib/economics";
import type { GenerateRequest } from "../src/lib/providers/types";

/**
 * Is the output actually good enough? — `npm run probe:quality`
 *
 * `npm run lexicon` answers a different question: whether eight settings come
 * back as eight visibly different *places*. This one answers whether any of it
 * is worth watching, and it does that by isolating the three variables that
 * were argued about rather than measured:
 *
 *   A. checkpoint   plain SDXL vs an anime checkpoint, same prompt, same seed
 *   B. resolution   the catalogue's 576x1024 vs 832x1216
 *   C. motion       what image-to-video does to a still, with the cadence pass
 *                   applied and withheld
 *
 * Each is a controlled pair. A grid of pretty pictures proves nothing; two
 * images differing in one variable is an experiment.
 *
 * Costs real money — a few cents for stills, a quarter for the motion leg. It
 * prints the bill and refuses to spend anything without `--yes`.
 */

const OUT = path.join(process.cwd(), ".probe");

/**
 * Deliberately a Group C composition: few large shapes, one light source, most
 * of the frame still. That is both the aesthetic worth aiming at and the one
 * image-to-video can carry — a frame packed with small figures turns to soup
 * the moment it moves, whatever the still looked like.
 */
const PROMPT = "a priest raises a lamp of flame at the river steps at night, wide shot";
const STYLE = "mythic";
const SETTING = "dravidian";

/** The catalogue's vertical, and a larger one. Stills cost ~$0.012 either way. */
const BASE_SIZE = { width: 576, height: 1024 };
const HI_SIZE = { width: 832, height: 1216 };

/** Fixed, so A and B differ by the stated variable and nothing else. */
const SEED = 20260816;

const DURATION_SEC = 5;

type Shot = {
  name: string;
  note: string;
  url: string;
  costUsdMicro: number;
  model: string;
  ms: number;
};

const shots: Shot[] = [];
let spentUsdMicro = 0;

function money(usdMicro: number): string {
  return `$${(usdMicro / 1_000_000).toFixed(3)} (₹${usdMicroToInr(usdMicro).toFixed(2)})`;
}

async function still(
  name: string,
  note: string,
  size: { width: number; height: number },
  checkpointOverride?: string,
): Promise<Shot> {
  // The provider reads its checkpoint from the environment at module scope, so
  // this is the only lever available without rewriting the adapter.
  const previous = process.env.FAL_STILL_CHECKPOINT;
  if (checkpointOverride !== undefined) {
    process.env.FAL_STILL_CHECKPOINT = checkpointOverride;
  }

  const { prompt, negativePrompt } = buildImagePrompt({
    prompt: PROMPT,
    style: STYLE,
    setting: SETTING,
  });

  const startedAt = Date.now();
  try {
    const result = await generateStill({
      requestId: `probe-${name}`,
      prompt,
      negativePrompt,
      width: size.width,
      height: size.height,
      seed: SEED,
    });

    const shot: Shot = {
      name,
      note,
      url: result.url,
      costUsdMicro: result.costUsdMicro,
      model: result.model,
      ms: Date.now() - startedAt,
    };

    spentUsdMicro += result.costUsdMicro;
    shots.push(shot);

    const asset = await fetchAsset(result.url, result.contentType);
    await writeFile(path.join(OUT, `${name}.png`), asset.body);

    console.log(
      `  ✓ ${name.padEnd(26)} ${String(Math.round(shot.ms / 100) / 10).padStart(5)}s  ${money(result.costUsdMicro)}  ${result.model}`,
    );
    return shot;
  } finally {
    if (checkpointOverride !== undefined) {
      if (previous === undefined) delete process.env.FAL_STILL_CHECKPOINT;
      else process.env.FAL_STILL_CHECKPOINT = previous;
    }
  }
}

/**
 * Animate a still and write both the raw render and the cadence pass.
 *
 * Two files on purpose. The claim in `mux.ts` is that decimating to the style's
 * drawing rate is "the difference between output that looks generic and output
 * that looks drawn" — that is a testable claim, and nobody has tested it.
 */
async function animate(from: Shot, size: { width: number; height: number }) {
  // No `setting` here: the motion prompt describes movement, and the lexicon
  // has already done its work on the still this render is conditioned on.
  const { prompt, negativePrompt } = buildMotionPrompt({
    prompt: PROMPT,
    style: STYLE,
  });

  const request: GenerateRequest = {
    requestId: "probe-motion",
    prompt,
    negativePrompt,
    style: STYLE,
    aspectRatio: "9:16",
    width: size.width,
    height: size.height,
    durationSec: DURATION_SEC,
    tier: "PREVIEW",
    language: "en",
    voiceId: "none",
    // fal serves its own output over a public URL, so the video model can fetch
    // the still directly — no storage round trip needed for a probe.
    firstFrameUrl: from.url,
  };

  console.log(`\n  Animating "${from.name}" — this takes a minute or two.`);
  const startedAt = Date.now();

  const sent = await dispatch(request);
  const provider = getProvider(sent.providerName);

  let status = await provider.status(sent.providerJobId);
  while (status.state === "queued" || status.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    status = await provider.status(sent.providerJobId);
    process.stdout.write(`\r    ${status.state} ${status.progress}%   `);
  }
  process.stdout.write("\r");

  if (status.state !== "succeeded" || !status.video) {
    console.log(`  ✗ motion failed: ${status.error?.message ?? status.state}`);
    return;
  }

  const cost = status.costUsdMicro ?? sent.estimatedCostUsdMicro;
  spentUsdMicro += cost;

  const raw = await fetchAsset(status.video.url, status.video.contentType);
  await writeFile(path.join(OUT, "motion-raw.mp4"), raw.body);

  const style = getStyle(STYLE);
  const stepped = await postProcess({
    video: raw,
    cadence: { drawingsPerSecond: style.drawingsPerSecond },
    timeoutMs: 120_000,
  });

  if (stepped) {
    await writeFile(path.join(OUT, "motion-cadence.mp4"), stepped.body);
  } else {
    console.log("  ! the cadence pass returned nothing — is ffmpeg present?");
  }

  console.log(
    `  ✓ motion ${DURATION_SEC}s via ${sent.model}  ${money(cost)}  ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
  console.log(
    `    motion-raw.mp4      as the vendor returned it` +
      (stepped
        ? `\n    motion-cadence.mp4  decimated to ${style.drawingsPerSecond} drawings/sec, held to 24`
        : ""),
  );
}

/** A contact sheet, because comparing two images means seeing them together. */
async function writeSheet(withMotion: boolean) {
  const cards = shots
    .map(
      (shot) => `
    <figure>
      <img src="./${shot.name}.png" alt="${shot.note}">
      <figcaption><b>${shot.name}</b><br>${shot.note}<br><small>${shot.model}</small></figcaption>
    </figure>`,
    )
    .join("");

  const video = withMotion
    ? `<section>
    <h2>C · motion</h2>
    <p>Same still, animated. The question is how much of the frame survives.</p>
    <div class="row">
      <figure><video src="./motion-raw.mp4" controls loop muted></video>
        <figcaption><b>raw</b><br>as the vendor returned it</figcaption></figure>
      <figure><video src="./motion-cadence.mp4" controls loop muted></video>
        <figcaption><b>cadence</b><br>held on twos/threes</figcaption></figure>
    </div>
  </section>`
    : "";

  await writeFile(
    path.join(OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Arka quality probe</title>
<style>
  body{background:#0a0504;color:#f0e9d9;font:15px/1.5 system-ui,sans-serif;margin:0;padding:40px}
  h1{font-size:28px;margin:0 0 4px} h2{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#ffa332;margin:40px 0 4px}
  p{color:#a79c92;margin:0 0 20px;max-width:60ch}
  .row{display:flex;gap:20px;flex-wrap:wrap}
  figure{margin:0;max-width:420px} img,video{width:100%;border-radius:6px;background:#130d0a;display:block}
  figcaption{color:#a79c92;font-size:13px;padding-top:8px} small{color:#6b615a}
  b{color:#f0e9d9}
</style>
<h1>Arka quality probe</h1>
<p>Prompt: <i>${PROMPT}</i> · style ${STYLE} · setting ${SETTING} · seed ${SEED}.
Each pair differs by one variable.</p>
<section><h2>A &amp; B · the still</h2><div class="row">${cards}</div></section>
${video}
<p style="margin-top:40px">Total spend: <b>${money(spentUsdMicro)}</b></p>`,
  );
}

async function main() {
  const go = process.argv.includes("--yes");
  const withMotion = process.argv.includes("--motion");
  const checkpoint = process.env.FAL_STILL_CHECKPOINT || "";

  const stillCost = 12_000;
  const plan = [
    ["A1", "plain SDXL, 576x1024", stillCost],
    ["A2", checkpoint ? `anime checkpoint, 576x1024` : "(skipped — no checkpoint)", checkpoint ? stillCost : 0],
    ["B1", checkpoint ? "anime checkpoint, 832x1216" : "plain SDXL, 832x1216", stillCost],
  ] as const;

  const motionCost = withMotion ? 50_000 * DURATION_SEC : 0;
  const estimate = plan.reduce((sum, [, , cost]) => sum + cost, 0) + motionCost;

  console.log("\n  Arka quality probe\n");
  for (const [id, note, cost] of plan) {
    if (cost === 0) console.log(`    ${id}  ${note}`);
    else console.log(`    ${id}  ${note.padEnd(34)} ~${money(cost)}`);
  }
  if (withMotion) {
    console.log(`    C   ${`image-to-video, ${DURATION_SEC}s + cadence`.padEnd(34)} ~${money(motionCost)}`);
  } else {
    console.log(`    C   image-to-video                     (add --motion)`);
  }
  console.log(`\n    estimated total                    ~${money(estimate)}\n`);

  if (!process.env.FAL_KEY) {
    console.log(
      "  FAL_KEY is not set, so there is nothing to probe — the mock provider\n" +
        "  would return its placeholder card and prove nothing.\n\n" +
        '  Put a key in .env and set VIDEO_PROVIDERS="fal,mock", then re-run.\n',
    );
    process.exit(1);
  }

  if (!checkpoint) {
    console.log(
      "  Note: FAL_STILL_CHECKPOINT is empty, so the still model is plain SDXL.\n" +
        "  Experiment A needs both sides to be meaningful — set it to an\n" +
        "  Illustrious or NoobAI repo id to compare against the fallback.\n",
    );
  }

  if (!go) {
    console.log("  Dry run. Nothing was spent. Re-run with --yes to go ahead.\n");
    return;
  }

  await mkdir(OUT, { recursive: true });
  console.log("  Rendering…\n");

  await still("A1-plain-sdxl", "plain SDXL, 576x1024", BASE_SIZE, "");

  let best: Shot | null = null;
  if (checkpoint) {
    best = await still("A2-checkpoint", `${checkpoint}, 576x1024`, BASE_SIZE);
  }

  const hi = await still(
    "B1-hi-res",
    `${checkpoint || "plain SDXL"}, 832x1216`,
    HI_SIZE,
  );
  best = best ?? hi;

  if (withMotion) await animate(best, BASE_SIZE);

  await writeSheet(withMotion);

  console.log(`\n  Spent ${money(spentUsdMicro)} — estimated ${money(estimate)}.`);
  console.log(`  Open ${path.relative(process.cwd(), path.join(OUT, "index.html"))}\n`);
}

main().catch((error) => {
  console.error("\n  Probe failed:", error instanceof Error ? error.message : error);
  console.error(`  Spent ${money(spentUsdMicro)} before failing.\n`);
  process.exit(1);
});
