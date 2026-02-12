"use client";

import { useEditorStore } from "@/stores/editor-store";
import { TimelineHeader } from "./timeline-header";
import { VideoTrack } from "./video-track";
import { AudioTrack } from "./audio-track";
import { MusicTrack } from "./music-track";
import { CaptionsTrack } from "./captions-track";
import { TimeRuler } from "./time-ruler";
import { Playhead } from "./playhead";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TimelineEditor() {
  const { zoom, getTotalDuration } = useEditorStore();
  const totalDuration = getTotalDuration();
  const pixelsPerSecond = zoom * 20;
  const timelineWidth = Math.max(totalDuration * pixelsPerSecond + 200, 800);

  return (
    <div className="flex h-full flex-col">
      {/* Playback controls */}
      <TimelineHeader />

      {/* Timeline tracks */}
      <div className="flex-1 overflow-x-auto overflow-y-auto relative">
        <div
          className="relative min-h-full"
          style={{ width: `${timelineWidth}px` }}
        >
          {/* Time ruler */}
          <TimeRuler
            duration={totalDuration}
            pixelsPerSecond={pixelsPerSecond}
          />

          {/* Playhead */}
          <Playhead pixelsPerSecond={pixelsPerSecond} />

          {/* Tracks */}
          <div className="space-y-0.5 pt-6">
            {/* Video track */}
            <div className="flex items-center">
              <div className="w-24 shrink-0 px-2 text-xs font-medium text-muted-foreground truncate border-r bg-muted/30 h-14 flex items-center">
                Video
              </div>
              <div className="flex-1 h-14">
                <VideoTrack pixelsPerSecond={pixelsPerSecond} />
              </div>
            </div>

            {/* Voiceover track */}
            <div className="flex items-center">
              <div className="w-24 shrink-0 px-2 text-xs font-medium text-muted-foreground truncate border-r bg-muted/30 h-10 flex items-center">
                Voiceover
              </div>
              <div className="flex-1 h-10">
                <AudioTrack
                  trackType="voiceover"
                  pixelsPerSecond={pixelsPerSecond}
                />
              </div>
            </div>

            {/* Music track */}
            <div className="flex items-center">
              <div className="w-24 shrink-0 px-2 text-xs font-medium text-muted-foreground truncate border-r bg-muted/30 h-10 flex items-center">
                Music
              </div>
              <div className="flex-1 h-10">
                <MusicTrack pixelsPerSecond={pixelsPerSecond} />
              </div>
            </div>

            {/* Captions track */}
            <div className="flex items-center">
              <div className="w-24 shrink-0 px-2 text-xs font-medium text-muted-foreground truncate border-r bg-muted/30 h-10 flex items-center">
                Captions
              </div>
              <div className="flex-1 h-10">
                <CaptionsTrack pixelsPerSecond={pixelsPerSecond} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
