"use client";

import { useEditorStore } from "@/stores/editor-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClipSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClipSelector({ open, onOpenChange }: ClipSelectorProps) {
  const { sceneClips, timelineClips, addClipToTimeline, removeClipFromTimeline } =
    useEditorStore();

  const timelineClipIds = new Set(timelineClips.map((c) => c.id));
  const sceneNumbers = Object.keys(sceneClips)
    .map(Number)
    .sort((a, b) => a - b);

  if (sceneNumbers.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Clips</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <Video className="mx-auto size-12 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No clips available. Generate video clips first.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Clips for Timeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {sceneNumbers.map((sceneNum) => {
            const clips = sceneClips[sceneNum] || [];
            return (
              <div key={sceneNum} className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  Scene {sceneNum}
                  <Badge variant="secondary" className="text-xs">
                    {clips.length} clip{clips.length !== 1 ? "s" : ""}
                  </Badge>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {clips.map((clip) => {
                    const isOnTimeline = timelineClipIds.has(clip.id);
                    return (
                      <div
                        key={clip.id}
                        className={cn(
                          "relative rounded-lg border-2 overflow-hidden cursor-pointer transition-colors",
                          isOnTimeline
                            ? "border-primary"
                            : "border-transparent hover:border-muted-foreground/50"
                        )}
                        onClick={() => {
                          if (isOnTimeline) {
                            removeClipFromTimeline(clip.id);
                          } else {
                            addClipToTimeline(clip);
                          }
                        }}
                      >
                        {/* Video thumbnail */}
                        <div className="aspect-video bg-muted flex items-center justify-center">
                          <video
                            src={clip.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        </div>

                        {/* Info overlay */}
                        <div className="p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              Clip {clip.clipNumber}
                            </span>
                            <span>{clip.duration.toFixed(1)}s</span>
                          </div>
                        </div>

                        {/* Selected indicator */}
                        {isOnTimeline && (
                          <div className="absolute top-1 right-1 size-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="size-3 text-primary-foreground" />
                          </div>
                        )}

                        {/* Add indicator on hover */}
                        {!isOnTimeline && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors">
                            <Plus className="size-6 text-white opacity-0 group-hover:opacity-100" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
