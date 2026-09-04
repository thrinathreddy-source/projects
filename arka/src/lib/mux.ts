import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { logger } from "@/lib/logger";

const run = promisify(execFile);

/**
 * Post-processing a render: the cadence pass, and muxing narration onto it.
 *
 * The video vendor returns silent video and the speech vendor returns bare
 * audio; something has to put them in one container, and doing it here rather
 * than asking a vendor keeps us free to change either one.
 *
 * `muxAudio` below stream-copies the video (`-c:v copy`) and is I/O-bound.
 * `postProcess` — the one the pipeline actually calls — re-encodes, because the
 * cadence pass is a filter and a filter cannot be a stream copy. That makes it
 * the most expensive thing a worker step does, so it takes an explicit timeout
 * from its caller rather than choosing one: the tick's remaining budget is the
 * only place that knows how long is safe.
 *
 * Every failure path degrades rather than throws: a video with the narration as
 * a separate track is a worse product than a muxed one, but it is a far better
 * outcome than losing a render the user already paid for. The caller is
 * expected to refund the narration surcharge when that happens.
 */

/** Formats ffmpeg can mux into. The mock provider's SVG is deliberately not one. */
const MUXABLE = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function canMux(videoContentType: string): boolean {
  return Boolean(ffmpegPath) && MUXABLE.has(videoContentType.split(";")[0].trim());
}

export type MuxResult = {
  body: Buffer;
  contentType: string;
};

/**
 * Combine a silent video and an audio track. Returns null when muxing is not
 * possible or fails, and the caller should keep the two assets separate.
 */
export async function muxAudio(
  video: { body: Buffer; contentType: string },
  audio: { body: Buffer; contentType: string },
): Promise<MuxResult | null> {
  if (!ffmpegPath || !canMux(video.contentType)) return null;

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "arka-mux-"));

  const videoPath = path.join(workspace, `in${extensionFor(video.contentType)}`);
  const audioPath = path.join(workspace, `in${extensionFor(audio.contentType)}`);
  const outputPath = path.join(workspace, "out.mp4");

  try {
    await fs.writeFile(videoPath, video.body);
    await fs.writeFile(audioPath, audio.body);

    await run(
      ffmpegPath,
      [
        "-y",
        "-i", videoPath,
        "-i", audioPath,
        // Copy the video stream untouched; only the audio is encoded.
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        // Narration longer than the shot would leave a black tail; clip to the
        // shorter of the two.
        "-shortest",
        "-movflags", "+faststart",
        outputPath,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );

    const body = await fs.readFile(outputPath);
    return { body, contentType: "video/mp4" };
  } catch (error) {
    logger.warn("storage", "Could not mux narration onto the render", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The anime cadence pass — the single most important thing Arka does to its
 * output.
 *
 * Studio animation is *limited* animation. A drawing is held for two frames
 * ("on twos", ~12 drawings a second) or three ("on threes", ~8), and that
 * held-frame cadence is most of what the eye reads as "anime". Video models
 * output smooth 24–30fps motion, and that smoothness is precisely why raw AI
 * video looks like a game cinematic instead of a cel.
 *
 * So we decimate to the style's drawing rate and then duplicate back up to a
 * standard container rate: `fps=12,fps=24` yields a 24fps file in which every
 * drawing is genuinely held for two frames. Same trick a telecine does.
 *
 * This is the one place we accept a re-encode. It costs a second or two of CPU
 * on a short clip, and it is the difference between output that looks generic
 * and output that looks drawn.
 */
export type Cadence = {
  /** Drawings per second: 12 = on twos, 8 = on threes, 6 = very held. */
  drawingsPerSecond: number;
  /** Container frame rate. 24 is the film standard anime is finished at. */
  outputFps?: number;
};

export type PostProcessInput = {
  video: { body: Buffer; contentType: string };
  /** Optional narration to mux in during the same pass. */
  audio?: { body: Buffer; contentType: string } | null;
  cadence?: Cadence | null;
  /**
   * Hard ceiling on the encode, from the caller's remaining tick budget.
   *
   * Being killed by the platform mid-encode loses the render and the money
   * already spent on it; timing out here loses only the cadence pass, and the
   * raw render is still delivered.
   */
  timeoutMs?: number;
};

/**
 * One ffmpeg invocation that applies the cadence and muxes narration.
 *
 * Doing both together matters: they would otherwise be two encodes, and the
 * second would throw away the first's output quality for no reason.
 *
 * Returns null when nothing could be done, in which case the caller keeps the
 * original render — degrading to a silent, smooth clip is always better than
 * losing one the user paid for.
 */
export async function postProcess({
  video,
  audio,
  cadence,
  timeoutMs = 25_000,
}: PostProcessInput): Promise<(MuxResult & { steppedFps: number | null }) | null> {
  if (!ffmpegPath) {
    // Degrading quietly here would ship the generic look on paid work, so say so.
    logger.error("queue", "ffmpeg is unavailable — skipping the cadence pass", {
      consequence: "Output will be smooth video rather than animation on twos.",
    });
    return null;
  }
  if (!canMux(video.contentType)) return null;
  if (!audio && !cadence) return null;

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "arka-post-"));
  const videoPath = path.join(workspace, `in${extensionFor(video.contentType)}`);
  const outputPath = path.join(workspace, "out.mp4");

  try {
    await fs.writeFile(videoPath, video.body);

    const args = ["-y", "-i", videoPath];

    let audioPath: string | null = null;
    if (audio) {
      audioPath = path.join(workspace, `in${extensionFor(audio.contentType)}`);
      await fs.writeFile(audioPath, audio.body);
      args.push("-i", audioPath);
    }

    if (cadence) {
      const outputFps = cadence.outputFps ?? 24;
      // Decimate to the drawing rate, then hold each drawing back up to the
      // container rate. `-fps_mode cfr` keeps the duplication honest.
      args.push(
        "-vf",
        `fps=${cadence.drawingsPerSecond},fps=${outputFps}`,
        "-fps_mode",
        "cfr",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        // Flat cel shading has large areas of identical colour; a lower CRF
        // costs little here and keeps linework from getting mushy.
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
      );
    } else {
      // Nothing to restyle — do not touch the video stream at all.
      args.push("-c:v", "copy");
    }

    if (audio) {
      args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
    }

    /**
     * Mark the file as synthetic.
     *
     * Not C2PA — that needs a signing certificate and a chain nobody is going
     * to verify on a Reel. This is the cheap, honest version: container
     * metadata that survives a download and says plainly what the file is.
     * Regulatory direction in India is towards mandatory labelling of synthetic
     * media, and a tag written from the first render is worth far more than one
     * retrofitted across a back catalogue later.
     */
    args.push(
      "-metadata",
      "comment=AI-generated with Arka (animearka.com)",
      "-metadata",
      "description=This video was generated by an AI model.",
      "-metadata",
      `creation_time=${new Date().toISOString()}`,
      "-movflags",
      "+faststart",
      outputPath,
    );

    await run(ffmpegPath, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 });

    return {
      body: await fs.readFile(outputPath),
      contentType: "video/mp4",
      steppedFps: cadence?.drawingsPerSecond ?? null,
    };
  } catch (error) {
    logger.warn("storage", "Post-processing failed; delivering the raw render", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
  };
  return map[contentType.split(";")[0].trim()] ?? ".bin";
}
