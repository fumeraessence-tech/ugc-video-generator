"use client";

import { useEditorStore } from "@/stores/editor-store";
import type { AudioClipType } from "@/types/editor";
import { cn } from "@/lib/utils";

interface AudioTrackProps {
  trackType: AudioClipType;
  pixelsPerSecond: number;
}

export function AudioTrack({ trackType, pixelsPerSecond }: AudioTrackProps) {
  const { voiceoverClips, sfxClips, selectedAudioId, setSelectedAudio } =
    useEditorStore();
  const clips = trackType === "voiceover" ? voiceoverClips : sfxClips;

  return (
    <div className="relative h-full">
      {clips.map((clip) => {
        const width = Math.max(
          (clip.duration - clip.trimStart - clip.trimEnd) * pixelsPerSecond,
          30
        );
        const left = clip.startTime * pixelsPerSecond;

        return (
          <div
            key={clip.id}
            className={cn(
              "absolute top-1 bottom-1 rounded border cursor-pointer transition-colors overflow-hidden",
              selectedAudioId === clip.id
                ? "border-primary bg-blue-500/20"
                : "border-border bg-blue-500/10 hover:border-blue-400"
            )}
            style={{ left: `${left}px`, width: `${width}px` }}
            onClick={() => setSelectedAudio(clip.id)}
          >
            <div className="px-1 text-[9px] truncate text-blue-400">
              {clip.label}
            </div>
          </div>
        );
      })}
      {clips.length === 0 && (
        <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/50">
          No {trackType}
        </div>
      )}
    </div>
  );
}
