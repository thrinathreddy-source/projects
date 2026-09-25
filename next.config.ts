import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Force the ffmpeg binary into the serverless bundle.
   *
   * `ffmpeg-static` resolves a 43MB binary at runtime from its own directory,
   * which Next's file tracer does not reliably follow. Without it the deployed
   * function has no ffmpeg, and `postProcess` is written to degrade quietly —
   * it returns null and the render continues.
   *
   * Quietly is the problem. The cadence pass is what makes the output read as
   * limited animation held on twos rather than smooth interpolated video, so
   * losing it does not break anything visibly: it just silently ships the
   * generic AI look we exist to avoid, on work the customer paid for. Narration
   * would stop being muxed into the video at the same time.
   */
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
