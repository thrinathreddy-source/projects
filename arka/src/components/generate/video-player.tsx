"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Plays a finished render.
 *
 * Two fallbacks, both real cases rather than defensive padding:
 *
 * 1. `audioSrc` — narration that could not be muxed into the container. The
 *    audio element is slaved to the video's transport so play, pause and seek
 *    stay in step.
 * 2. Non-video assets render as an image, which is what the mock provider
 *    produces so the whole flow is demonstrable without a model vendor.
 */
export function VideoPlayer({
  src,
  poster,
  audioSrc,
  className,
  autoPlay = true,
}: {
  src: string;
  poster?: string | null;
  audioSrc?: string | null;
  className?: string;
  autoPlay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isImage = /\.(svg|png|jpe?g|webp)(\?|$)/i.test(src) || src.startsWith("data:image");

  // Keep the separate narration track locked to the video's transport.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const play = () => void audio.play().catch(() => {});
    const pause = () => audio.pause();
    const seek = () => {
      audio.currentTime = video.currentTime;
    };

    video.addEventListener("play", play);
    video.addEventListener("pause", pause);
    video.addEventListener("seeking", seek);
    video.addEventListener("ended", pause);

    return () => {
      video.removeEventListener("play", play);
      video.removeEventListener("pause", pause);
      video.removeEventListener("seeking", seek);
      video.removeEventListener("ended", pause);
    };
  }, [src, audioSrc]);

  if (isImage) {
    // Signed, expiring URLs on an arbitrary host — next/image cannot optimise
    // or cache these, so a plain <img> is the correct element here.
    return (
      <div className={cn("relative h-full w-full", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Generated render" className="h-full w-full object-contain" />
        {audioSrc ? (
          <audio
            src={audioSrc}
            controls
            className="absolute inset-x-2 bottom-2 w-[calc(100%-1rem)]"
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        controls
        loop
        playsInline
        autoPlay={autoPlay}
        // Autoplay only works muted; with a separate narration track we cannot
        // autoplay at all without the audio being blocked out of sync.
        muted={autoPlay && !audioSrc}
        className={cn("h-full w-full object-contain", className)}
      />
      {audioSrc ? <audio ref={audioRef} src={audioSrc} preload="auto" /> : null}
    </>
  );
}
