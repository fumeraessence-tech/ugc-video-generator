"use client";

import { useEditorStore } from "@/stores/editor-store";
import { ASPECT_RATIO_PRESETS } from "@/types/editor";
import { PreviewPlayer } from "./preview-player";
import { PreviewCaptions } from "./preview-captions";
import { PreviewControls } from "./preview-controls";
import { Film } from "lucide-react";

export function VideoPreviewPanel() {
  const { timelineClips, aspectRatio } = useEditorStore();
  const hasClips = timelineClips.length > 0;

  if (!hasClips) {
    return (
      <div className="flex h-full items-center justify-center bg-black/90">
        <div className="text-center space-y-3">
          <Film className="size-12 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Add clips to the timeline to preview
          </p>
        </div>
      </div>
    );
  }

  // Calculate aspect ratio for the preview frame
  const preset = ASPECT_RATIO_PRESETS.find((p) => p.id === aspectRatio);
  const arWidth = preset?.width ?? 16;
  const arHeight = preset?.height ?? 9;

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Video + captions with aspect ratio framing */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        <div
          className="relative overflow-hidden bg-black rounded"
          style={{
            aspectRatio: `${arWidth} / ${arHeight}`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <PreviewPlayer />
          <PreviewCaptions />
        </div>
      </div>

      {/* Controls */}
      <PreviewControls />
    </div>
  );
}
