"use client";

import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";

interface CaptionsTrackProps {
  pixelsPerSecond: number;
}

export function CaptionsTrack({ pixelsPerSecond }: CaptionsTrackProps) {
  const { captions, selectedCaptionId, setSelectedCaption } = useEditorStore();

  return (
    <div className="relative h-full">
      {captions.map((caption) => {
        const width = Math.max(
          (caption.endTime - caption.startTime) * pixelsPerSecond,
          30
        );
        const left = caption.startTime * pixelsPerSecond;

        return (
          <div
            key={caption.id}
            className={cn(
              "absolute top-1 bottom-1 rounded border cursor-pointer transition-colors overflow-hidden",
              selectedCaptionId === caption.id
                ? "border-primary bg-yellow-500/20"
                : "border-border bg-yellow-500/10 hover:border-yellow-400"
            )}
            style={{ left: `${left}px`, width: `${width}px` }}
            onClick={() => setSelectedCaption(caption.id)}
          >
            <div className="px-1 text-[9px] truncate text-yellow-400">
              {caption.text}
            </div>
          </div>
        );
      })}
      {captions.length === 0 && (
        <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/50">
          No captions
        </div>
      )}
    </div>
  );
}
