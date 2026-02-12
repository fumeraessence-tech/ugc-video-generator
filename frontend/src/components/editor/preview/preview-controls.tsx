"use client";

import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";

export function PreviewControls() {
  const {
    playbackState,
    currentTime,
    masterVolume,
    play,
    pause,
    stop,
    seek,
    setMasterVolume,
    getTotalDuration,
  } = useEditorStore();

  const totalDuration = getTotalDuration();

  return (
    <div className="flex items-center gap-3 px-4 h-10 border-t border-white/10 bg-black/80">
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => seek(0)}
        >
          <SkipBack className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-white hover:text-white hover:bg-white/10"
          onClick={() => (playbackState === "playing" ? pause() : play())}
        >
          {playbackState === "playing" ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-white/70 hover:text-white hover:bg-white/10"
          onClick={stop}
        >
          <Square className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => seek(Math.min(totalDuration, currentTime + 5))}
        >
          <SkipForward className="size-3.5" />
        </Button>
      </div>

      {/* Timecode */}
      <span className="text-xs text-white/60 font-mono min-w-[80px]">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>

      {/* Scrub bar */}
      <div className="flex-1">
        <Slider
          value={[currentTime]}
          onValueChange={([v]) => seek(v)}
          min={0}
          max={totalDuration || 1}
          step={0.1}
          className="cursor-pointer"
        />
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5">
        <Volume2 className="size-3.5 text-white/50" />
        <div className="w-16">
          <Slider
            value={[masterVolume]}
            onValueChange={([v]) => setMasterVolume(v)}
            min={0}
            max={100}
            step={1}
          />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}
