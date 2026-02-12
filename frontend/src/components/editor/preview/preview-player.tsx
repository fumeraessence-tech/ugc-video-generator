"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import type { TimelineClip } from "@/types/editor";

interface ClipTimeRange {
  clip: TimelineClip;
  start: number; // timeline start time
  end: number; // timeline end time
}

/**
 * Resolves the active clip and its local seek time from the global currentTime.
 */
function resolveActiveClip(
  clips: TimelineClip[],
  currentTime: number
): { clip: TimelineClip; localTime: number; range: ClipTimeRange } | null {
  let elapsed = 0;
  for (const clip of clips) {
    const effectiveDuration = clip.duration - clip.trimStart - clip.trimEnd;
    if (effectiveDuration <= 0) continue;
    if (currentTime < elapsed + effectiveDuration) {
      return {
        clip,
        localTime: clip.trimStart + (currentTime - elapsed),
        range: { clip, start: elapsed, end: elapsed + effectiveDuration },
      };
    }
    elapsed += effectiveDuration;
  }
  // Past the end — return last clip
  if (clips.length > 0) {
    const last = clips[clips.length - 1];
    return {
      clip: last,
      localTime: last.duration - last.trimEnd,
      range: {
        clip: last,
        start: elapsed - (last.duration - last.trimStart - last.trimEnd),
        end: elapsed,
      },
    };
  }
  return null;
}

export function PreviewPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  const {
    timelineClips,
    playbackState,
    currentTime,
    seek,
    pause,
    getTotalDuration,
    transitions,
  } = useEditorStore();

  const totalDuration = getTotalDuration();
  const resolved = resolveActiveClip(timelineClips, currentTime);

  // Sync video element with the resolved clip
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolved) return;

    // Switch video source when active clip changes
    if (resolved.clip.id !== activeClipId) {
      setActiveClipId(resolved.clip.id);
      if (resolved.clip.videoUrl) {
        video.src = resolved.clip.videoUrl;
        video.currentTime = resolved.localTime;
        if (playbackState === "playing") {
          video.play().catch(() => {});
        }
      }
    }
  }, [resolved?.clip.id, activeClipId, resolved?.clip.videoUrl, resolved?.localTime, playbackState]);

  // Handle play/pause state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolved?.clip.videoUrl) return;

    if (playbackState === "playing") {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playbackState, resolved?.clip.videoUrl]);

  // Playback animation loop: advance currentTime while playing
  const tick = useCallback(() => {
    if (useEditorStore.getState().playbackState !== "playing") return;

    const duration = useEditorStore.getState().getTotalDuration();
    const ct = useEditorStore.getState().currentTime;
    const nextTime = ct + 1 / 30; // ~30fps tick

    if (nextTime >= duration) {
      useEditorStore.getState().stop();
      return;
    }

    seek(nextTime);
    rafRef.current = requestAnimationFrame(tick);
  }, [seek]);

  useEffect(() => {
    if (playbackState === "playing") {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playbackState, tick]);

  // Get transition class for CSS-based preview
  const getTransitionStyle = (): string => {
    if (!resolved) return "";
    // Check if there's a transition entering this clip
    const prevIdx = timelineClips.findIndex((c) => c.id === resolved.clip.id) - 1;
    if (prevIdx < 0) return "";
    const prevClipId = timelineClips[prevIdx].id;
    const trans = transitions.find((t) => t.afterClipId === prevClipId);
    if (!trans || trans.transition.type === "none") return "";

    // Only apply transition at the start of a clip
    const timeSinceClipStart = currentTime - resolved.range.start;
    if (timeSinceClipStart > trans.transition.duration) return "";

    switch (trans.transition.type) {
      case "fade":
      case "crossfade":
        return "animate-fade-in";
      case "slide-left":
        return "animate-slide-in-left";
      case "slide-right":
        return "animate-slide-in-right";
      case "slide-up":
        return "animate-slide-in-up";
      case "slide-down":
        return "animate-slide-in-down";
      case "zoom-in":
        return "animate-zoom-in";
      case "zoom-out":
        return "animate-zoom-out";
      default:
        return "animate-fade-in";
    }
  };

  if (!resolved) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        No clips to preview
      </div>
    );
  }

  const transitionClass = getTransitionStyle();

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {resolved.clip.videoUrl ? (
        <video
          ref={videoRef}
          className={`w-full h-full object-contain ${transitionClass}`}
          playsInline
          muted
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center ${transitionClass}`}>
          <div className="text-center space-y-2">
            <div className="size-20 mx-auto rounded-lg bg-muted/20 flex items-center justify-center border border-dashed border-muted-foreground/30">
              <span className="text-3xl font-bold text-muted-foreground/40">
                S{resolved.clip.sceneNumber}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/60">
              No video generated for Scene {resolved.clip.sceneNumber}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
