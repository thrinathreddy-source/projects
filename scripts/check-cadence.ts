import "dotenv/config";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { postProcess } from "../src/lib/mux";
import { VIDEO_STYLES } from "../src/lib/catalog";

/**
 * Proves the anime cadence pass does what it claims — `npx tsx
 * scripts/check-cadence.ts`.
 *
 * Synthesises a 30fps clip in which every frame differs, runs it through the
 * pass, then counts how many *distinct* frames survive. On twos, a 24fps
 * output should contain ~12 unique drawings per second, each held twice.
 * Anything else means we are shipping smooth video while claiming otherwise.
 */

const run = promisify(execFile);

async function main() {
  if (!ffmpegPath) throw new Error("ffmpeg-static is not installed");

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "arka-cadence-"));
  const sourcePath = path.join(workspace, "source.mp4");

  // A 2-second 30fps clip whose content changes every single frame.
  await run(ffmpegPath, [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc=size=320x240:rate=30:duration=2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    sourcePath,
  ]);

  const source = {
    body: await fs.readFile(sourcePath),
    contentType: "video/mp4",
  };

  console.log("source: 30fps, 2s, every frame unique\n");

  for (const style of VIDEO_STYLES) {
    const result = await postProcess({
      video: source,
      cadence: { drawingsPerSecond: style.drawingsPerSecond },
    });

    if (!result) {
      console.log(`${style.label.padEnd(14)} FAILED`);
      continue;
    }

    const outPath = path.join(workspace, `${style.id}.mp4`);
    await fs.writeFile(outPath, result.body);

    // `mpdecimate` drops frames identical to their predecessor, so the number
    // of frames it keeps is the number of distinct drawings.
    const { stderr } = await run(ffmpegPath, [
      "-i", outPath,
      "-vf", "mpdecimate",
      "-f", "null",
      "-",
    ]).catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? "" }));

    // ffmpeg rewrites its progress line with carriage returns, so the final
    // count is the last `frame=` match anywhere in stderr, not the last line.
    const counts = [...stderr.matchAll(/frame=\s*(\d+)/g)].map((m) => Number(m[1]));
    const distinct = counts.length > 0 ? counts[counts.length - 1] : 0;
    const expected = style.drawingsPerSecond * 2; // 2 seconds of source

    const ok = Math.abs(distinct - expected) <= 2;
    console.log(
      `${style.label.padEnd(14)} ${String(style.drawingsPerSecond).padStart(2)} drawings/s  ` +
        `→ ${String(distinct).padStart(3)} distinct frames over 2s ` +
        `(expected ~${expected}) ${ok ? "✓" : "✗"}`,
    );
  }

  await fs.rm(workspace, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
