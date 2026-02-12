"use client";

import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, SkipBack } from "lucide-react";

export function TimelineHeader() {
  const { playbackState, currentTime, getTotalDuration, play, pause, stop, seek } =
    useEditorStore();
  const totalDuration = getTotalDuration();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="flex h-8 items-center gap-1 border-b bg-muted/30 px-2">
      {/* Skip to start */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => seek(0)}
      >
        <SkipBack className="size-3" />
      </Button>

      {/* Play/Pause */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => {
          if (playbackState === "playing") {
            pause();
          } else {
            play();
          }
        }}
      >
        {playbackState === "playing" ? (
          <Pause className="size-3" />
        ) : (
          <Play className="size-3" />
        )}
      </Button>

      {/* Stop */}
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={stop}
      >
        <Square className="size-3" />
      </Button>

      {/* Time display */}
      <span className="ml-2 text-xs font-mono text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>
    </div>
  );
}
