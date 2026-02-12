"use client";

import { useEditorStore } from "@/stores/editor-store";
import type { EditorPanel } from "@/types/editor";
import { cn } from "@/lib/utils";
import {
  SlidersHorizontal,
  Shuffle,
  Music,
  Captions,
  AudioLines,
} from "lucide-react";
import { ClipPropertiesPanel } from "./clip-properties-panel";
import { TransitionsPanel } from "./transitions-panel";
import { MusicPanel } from "./music-panel";
import { AudioPanel } from "./audio-panel";
import { CaptionsPanel } from "./captions-panel";

const TABS: { id: EditorPanel; label: string; icon: React.ElementType }[] = [
  { id: "properties", label: "Properties", icon: SlidersHorizontal },
  { id: "transitions", label: "Transitions", icon: Shuffle },
  { id: "music", label: "Music", icon: Music },
  { id: "captions", label: "Captions", icon: Captions },
  { id: "audio", label: "Audio", icon: AudioLines },
];

export function PropertiesPanel() {
  const { activePanel, setActivePanel } = useEditorStore();

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                activePanel === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActivePanel(tab.id)}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activePanel === "properties" && <ClipPropertiesPanel />}
        {activePanel === "transitions" && <TransitionsPanel />}
        {activePanel === "music" && <MusicPanel />}
        {activePanel === "captions" && <CaptionsPanel />}
        {activePanel === "audio" && <AudioPanel />}
      </div>
    </div>
  );
}

