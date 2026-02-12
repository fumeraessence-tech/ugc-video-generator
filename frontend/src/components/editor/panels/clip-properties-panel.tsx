"use client";

import { useEditorStore } from "@/stores/editor-store";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trash2, Crop, RotateCcw } from "lucide-react";

export function ClipPropertiesPanel() {
  const {
    selectedClipId,
    timelineClips,
    scriptScenes,
    sceneClips,
    updateClipTrim,
    removeClipFromTimeline,
    replaceClip,
    setClipCrop,
  } = useEditorStore();

  const clip = selectedClipId
    ? timelineClips.find((c) => c.id === selectedClipId) ?? null
    : null;

  if (!clip) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Select a clip on the timeline to edit its properties
      </div>
    );
  }

  const effectiveDuration = clip.duration - clip.trimStart - clip.trimEnd;
  const scene = scriptScenes.find((s) => s.sceneNumber === clip.sceneNumber);
  const alternateClips = (sceneClips[clip.sceneNumber] || []).filter(
    (c) => c.id !== clip.id
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          Scene {clip.sceneNumber} - Clip {clip.clipNumber}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive hover:text-destructive"
          onClick={() => removeClipFromTimeline(clip.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Scene info */}
      {scene && (
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground uppercase">
            {scene.sceneType}
          </div>
          {scene.dialogue && (
            <p className="text-xs leading-relaxed">&ldquo;{scene.dialogue}&rdquo;</p>
          )}
          {scene.action && (
            <p className="text-xs text-muted-foreground">{scene.action}</p>
          )}
        </div>
      )}

      {/* Duration info */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Original Duration</span>
          <span>{clip.duration.toFixed(1)}s</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Effective Duration</span>
          <span className="font-medium">{effectiveDuration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Trim controls */}
      <div className="space-y-3">
        <Label className="text-xs font-medium">Trim Start: {clip.trimStart.toFixed(1)}s</Label>
        <Slider
          value={[clip.trimStart]}
          onValueChange={([v]) =>
            updateClipTrim(clip.id, v, clip.trimEnd)
          }
          min={0}
          max={Math.max(0, clip.duration - clip.trimEnd - 0.5)}
          step={0.1}
        />
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-medium">Trim End: {clip.trimEnd.toFixed(1)}s</Label>
        <Slider
          value={[clip.trimEnd]}
          onValueChange={([v]) =>
            updateClipTrim(clip.id, clip.trimStart, v)
          }
          min={0}
          max={Math.max(0, clip.duration - clip.trimStart - 0.5)}
          step={0.1}
        />
      </div>

      <Separator />

      {/* Crop controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Crop className="size-3" />
            Crop
          </Label>
          {clip.crop && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => setClipCrop(clip.id, { x: 0, y: 0, width: 100, height: 100 })}
            >
              <RotateCcw className="size-2.5" />
              Reset
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              X: {(clip.crop?.x ?? 0).toFixed(0)}%
            </Label>
            <Slider
              value={[clip.crop?.x ?? 0]}
              onValueChange={([v]) =>
                setClipCrop(clip.id, {
                  x: v,
                  y: clip.crop?.y ?? 0,
                  width: clip.crop?.width ?? 100,
                  height: clip.crop?.height ?? 100,
                })
              }
              min={0}
              max={50}
              step={1}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Y: {(clip.crop?.y ?? 0).toFixed(0)}%
            </Label>
            <Slider
              value={[clip.crop?.y ?? 0]}
              onValueChange={([v]) =>
                setClipCrop(clip.id, {
                  x: clip.crop?.x ?? 0,
                  y: v,
                  width: clip.crop?.width ?? 100,
                  height: clip.crop?.height ?? 100,
                })
              }
              min={0}
              max={50}
              step={1}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Width: {(clip.crop?.width ?? 100).toFixed(0)}%
            </Label>
            <Slider
              value={[clip.crop?.width ?? 100]}
              onValueChange={([v]) =>
                setClipCrop(clip.id, {
                  x: clip.crop?.x ?? 0,
                  y: clip.crop?.y ?? 0,
                  width: v,
                  height: clip.crop?.height ?? 100,
                })
              }
              min={20}
              max={100}
              step={1}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Height: {(clip.crop?.height ?? 100).toFixed(0)}%
            </Label>
            <Slider
              value={[clip.crop?.height ?? 100]}
              onValueChange={([v]) =>
                setClipCrop(clip.id, {
                  x: clip.crop?.x ?? 0,
                  y: clip.crop?.y ?? 0,
                  width: clip.crop?.width ?? 100,
                  height: v,
                })
              }
              min={20}
              max={100}
              step={1}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Alternate clips for replacement */}
      {alternateClips.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Replace with alternate</Label>
          <div className="grid grid-cols-2 gap-2">
            {alternateClips.map((alt) => (
              <button
                key={alt.id}
                className="rounded-lg border p-2 text-xs hover:border-primary transition-colors"
                onClick={() => replaceClip(clip.id, alt)}
              >
                <div className="aspect-video bg-muted rounded mb-1 flex items-center justify-center">
                  {alt.videoUrl ? (
                    <video
                      src={alt.videoUrl}
                      className="w-full h-full object-cover rounded"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <span className="text-muted-foreground text-[10px]">No video</span>
                  )}
                </div>
                <span className="text-muted-foreground">Clip {alt.clipNumber}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
