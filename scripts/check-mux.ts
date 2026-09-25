import "dotenv/config";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { muxAudio, canMux } from "../src/lib/mux";
import { MockVoiceProvider } from "../src/lib/providers/voice-mock";

/**
 * Verifies the narration mux path end to end — `npx tsx scripts/check-mux.ts`.
 *
 * The mock video provider emits SVG, which is deliberately not muxable, so
 * this synthesises a real MP4 to exercise the branch that runs against a live
 * video vendor.
 */

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "arka-check-"));
  const videoPath = path.join(workspace, "silent.mp4");

  // A 5-second silent test clip standing in for a provider render.
  execFileSync(ffmpegPath!, [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=0x1a1a1a:s=576x1024:d=5",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    videoPath,
  ], { stdio: "ignore" });

  const video = {
    body: await fs.readFile(videoPath),
    contentType: "video/mp4",
  };

  const speech = await new MockVoiceProvider().synthesize({
    requestId: "check",
    text: "He was sixteen. He knew how to enter the formation.",
    language: "hi",
    voiceId: "vikram",
    targetDurationSec: 5,
  });

  const audio = {
    body: Buffer.from(speech.url.split(",")[1], "base64"),
    contentType: "audio/wav",
  };

  console.log("canMux(video/mp4):", canMux("video/mp4"));
  console.log("canMux(image/svg+xml):", canMux("image/svg+xml"));
  console.log("silent video bytes:", video.body.byteLength);
  console.log("narration bytes:   ", audio.body.byteLength);

  const muxed = await muxAudio(video, audio);
  if (!muxed) {
    console.error("FAIL: mux returned null");
    process.exit(1);
  }

  const outPath = path.join(workspace, "muxed.mp4");
  await fs.writeFile(outPath, muxed.body);

  // ffmpeg prints stream layout to stderr when asked to probe with no output.
  let probe = "";
  try {
    execFileSync(ffmpegPath!, ["-i", outPath], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    probe = String((error as { stderr?: Buffer }).stderr ?? "");
  }

  const streams = probe
    .split("\n")
    .filter((line) => line.includes("Stream #"))
    .map((line) => line.trim());

  console.log("muxed bytes:       ", muxed.body.byteLength);
  console.log("muxed streams:");
  for (const stream of streams) console.log("  ", stream);

  const hasVideo = streams.some((s) => s.includes("Video:"));
  const hasAudio = streams.some((s) => s.includes("Audio:"));

  await fs.rm(workspace, { recursive: true, force: true });

  if (!hasVideo || !hasAudio) {
    console.error(`FAIL: expected both streams (video=${hasVideo} audio=${hasAudio})`);
    process.exit(1);
  }

  console.log("\nPASS — narration muxed into a single mp4 with both streams.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
