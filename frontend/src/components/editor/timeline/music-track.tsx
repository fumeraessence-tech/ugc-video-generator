"use client";

import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";

interface MusicTrackProps {
  pixelsPerSecond: number;
}

export function MusicTrack({ pixelsPerSecond }: MusicTrackProps) {
  const { musicClips, selectedAudioId, setSelectedAudio } = useEditorStore();

  return (
    <div className="relative h-full">
      {musicClips.map((clip) => {
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
                ? "border-primary bg-green-500/20"
                : "border-border bg-green-500/10 hover:border-green-400"
            )}
            style={{ left: `${left}px`, width: `${width}px` }}
            onClick={() => setSelectedAudio(clip.id)}
          >
            <div className="px-1 text-[9px] truncate text-green-400">
              {clip.label}
            </div>
          </div>
        );
      })}
      {musicClips.length === 0 && (
        <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/50">
          No music
        </div>
      )}
    </div>
  );
}
