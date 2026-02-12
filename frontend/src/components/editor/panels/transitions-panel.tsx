"use client";

import { useEditorStore } from "@/stores/editor-store";
import { TRANSITION_PRESETS } from "@/types/editor";
import type { TransitionType } from "@/types/editor";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { useState } from "react";

export function TransitionsPanel() {
  const { timelineClips, transitions, setTransition, removeTransition, selectedClipId } =
    useEditorStore();

  // Find the transition slot after the selected clip
  const selectedClipIdx = selectedClipId
    ? timelineClips.findIndex((c) => c.id === selectedClipId)
    : -1;

  const canAddTransition =
    selectedClipIdx >= 0 && selectedClipIdx < timelineClips.length - 1;

  const currentTransition = selectedClipId
    ? transitions.find((t) => t.afterClipId === selectedClipId)
    : null;

  const [customDuration, setCustomDuration] = useState(
    currentTransition?.transition.duration ?? 0.5
  );

  const handleSelectTransition = (preset: TransitionType) => {
    if (!selectedClipId) return;

    if (preset.type === "none") {
      // Remove transition
      const existing = transitions.find((t) => t.afterClipId === selectedClipId);
      if (existing) removeTransition(existing.id);
      return;
    }

    setTransition(selectedClipId, {
      id: `trans-${selectedClipId}`,
      afterClipId: selectedClipId,
      transition: { ...preset, duration: customDuration },
    });
  };

  if (!canAddTransition) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Transitions</h3>
        <p className="text-xs text-muted-foreground">
          Select a clip on the timeline (except the last) to add a transition after it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Transitions</h3>
      <p className="text-xs text-muted-foreground">
        Select a transition to apply after Scene{" "}
        {timelineClips[selectedClipIdx]?.sceneNumber}.
      </p>

      {/* Duration slider */}
      <div className="space-y-2">
        <Label className="text-xs">Duration: {customDuration.toFixed(1)}s</Label>
        <Slider
          value={[customDuration]}
          onValueChange={([v]) => setCustomDuration(v)}
          min={0.2}
          max={2.0}
          step={0.1}
        />
      </div>

      {/* Transition presets grid */}
      <div className="grid grid-cols-3 gap-2">
        {TRANSITION_PRESETS.map((preset) => {
          const isActive =
            preset.type === "none"
              ? !currentTransition
              : currentTransition?.transition.type === preset.type;

          return (
            <button
              key={preset.id}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-muted-foreground/50 text-muted-foreground"
              )}
              onClick={() => handleSelectTransition(preset)}
            >
              <TransitionIcon type={preset.type} />
              <span className="font-medium">{preset.label}</span>
              {isActive && (
                <Check className="absolute top-1 right-1 size-3 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TransitionIcon({ type }: { type: string }) {
  // Simple visual representations using CSS
  const baseClass = "size-8 rounded bg-muted/50 flex items-center justify-center";

  switch (type) {
    case "none":
      return (
        <div className={baseClass}>
          <div className="w-4 h-0.5 bg-muted-foreground/30" />
        </div>
      );
    case "fade":
    case "crossfade":
    case "dissolve":
      return (
        <div className={baseClass}>
          <div className="w-5 h-5 rounded bg-gradient-to-r from-foreground/50 to-transparent" />
        </div>
      );
    case "slide-left":
    case "wipe-left":
      return (
        <div className={baseClass}>
          <div className="w-5 h-5 flex">
            <div className="w-1/2 bg-foreground/40 rounded-l" />
            <div className="w-1/2 bg-foreground/15 rounded-r" />
          </div>
        </div>
      );
    case "slide-right":
    case "wipe-right":
      return (
        <div className={baseClass}>
          <div className="w-5 h-5 flex">
            <div className="w-1/2 bg-foreground/15 rounded-l" />
            <div className="w-1/2 bg-foreground/40 rounded-r" />
          </div>
        </div>
      );
    case "slide-up":
      return (
        <div className={baseClass}>
          <div className="w-5 h-5 flex flex-col">
            <div className="h-1/2 bg-foreground/40 rounded-t" />
            <div className="h-1/2 bg-foreground/15 rounded-b" />
          </div>
        </div>
      );
    case "slide-down":
      return (
        <div className={baseClass}>
          <div className="w-5 h-5 flex flex-col">
            <div className="h-1/2 bg-foreground/15 rounded-t" />
            <div className="h-1/2 bg-foreground/40 rounded-b" />
          </div>
        </div>
      );
    case "zoom-in":
      return (
        <div className={baseClass}>
          <div className="size-3 rounded-sm bg-foreground/40 ring-2 ring-foreground/15" />
        </div>
      );
    case "zoom-out":
      return (
        <div className={baseClass}>
          <div className="size-5 rounded-sm bg-foreground/15 flex items-center justify-center">
            <div className="size-2 rounded-sm bg-foreground/40" />
          </div>
        </div>
      );
    default:
      return (
        <div className={baseClass}>
          <div className="size-3 rounded bg-foreground/30" />
        </div>
      );
  }
}
