"use client";

import { useEditorStore } from "@/stores/editor-store";
import { ASPECT_RATIO_PRESETS } from "@/types/editor";
import type { AspectRatio } from "@/types/editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  ArrowLeft,
  Layers,
  Film,
  RectangleHorizontal,
} from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  onOpenClipSelector: () => void;
  onOpenExport: () => void;
}

export function EditorToolbar({ onOpenClipSelector, onOpenExport }: EditorToolbarProps) {
  const { zoom, setZoom, timelineClips, getTotalDuration, aspectRatio, setAspectRatio } =
    useEditorStore();

  const totalDuration = getTotalDuration();

  return (
    <div className="flex h-12 items-center gap-2 border-b bg-background px-3">
      {/* Back to generator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link href="/generate">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to Generator</TooltipContent>
      </Tooltip>

      {/* Project info */}
      <div className="flex items-center gap-2">
        <Film className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Video Editor</span>
        <span className="text-xs text-muted-foreground">
          {timelineClips.length} clips &middot; {totalDuration.toFixed(1)}s
        </span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Clip selector */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onOpenClipSelector}
          >
            <Layers className="size-3" />
            Clips
          </Button>
        </TooltipTrigger>
        <TooltipContent>Manage clip selection</TooltipContent>
      </Tooltip>

      {/* Aspect Ratio Selector */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <RectangleHorizontal className="size-3" />
                {aspectRatio}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Aspect Ratio</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          {ASPECT_RATIO_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => setAspectRatio(preset.id)}
              className={cn(
                "gap-2",
                aspectRatio === preset.id && "bg-accent"
              )}
            >
              <AspectRatioIcon ratio={preset.id} />
              <span>{preset.id}</span>
              <span className="text-muted-foreground text-xs ml-auto">
                {preset.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* Undo / Redo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled>
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled>
            <Redo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Zoom controls */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom - 1)}
            disabled={zoom <= 1}
          >
            <ZoomOut className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom Out</TooltipContent>
      </Tooltip>
      <div className="w-24">
        <Slider
          value={[zoom]}
          onValueChange={([v]) => setZoom(v)}
          min={1}
          max={10}
          step={1}
        />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom + 1)}
            disabled={zoom >= 10}
          >
            <ZoomIn className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom In</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-6" />

      {/* Export */}
      <Button size="sm" className="gap-1" onClick={onOpenExport}>
        <Download className="size-3" />
        Export
      </Button>
    </div>
  );
}

function AspectRatioIcon({ ratio }: { ratio: AspectRatio }) {
  const sizeMap: Record<AspectRatio, { w: string; h: string }> = {
    "16:9": { w: "w-5", h: "h-3" },
    "9:16": { w: "w-3", h: "h-5" },
    "1:1": { w: "w-4", h: "h-4" },
    "4:5": { w: "w-3.5", h: "h-4" },
  };
  const { w, h } = sizeMap[ratio];
  return (
    <div className={`${w} ${h} rounded-[2px] border border-current`} />
  );
}
