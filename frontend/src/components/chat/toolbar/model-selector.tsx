"use client"

import { Cpu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useChatStore } from "@/stores/chat-store"
import {
  VIDEO_MODEL_LABELS,
  SCRIPT_MODEL_LABELS,
  STORYBOARD_MODEL_LABELS,
  TTS_MODEL_LABELS,
} from "@/types/generation"
import type { ScriptModel, StoryboardModel, VideoModel, TTSModel } from "@/types/generation"

export function ModelSelector() {
  const selectedModel = useChatStore((s) => s.selectedModel)
  const setSelectedModel = useChatStore((s) => s.setSelectedModel)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium">
          <Cpu className="size-3.5" />
          {VIDEO_MODEL_LABELS[selectedModel.video]}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-4" align="start">
        <p className="text-sm font-medium">Model Selection</p>

        {/* Script Model */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Script Model</p>
          <Select
            value={selectedModel.script}
            onValueChange={(v) => setSelectedModel({ script: v as ScriptModel })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SCRIPT_MODEL_LABELS) as [ScriptModel, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Storyboard Model */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Storyboard Model</p>
          <Select
            value={selectedModel.storyboard}
            onValueChange={(v) => setSelectedModel({ storyboard: v as StoryboardModel })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(STORYBOARD_MODEL_LABELS) as [StoryboardModel, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Video Model */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Video Model</p>
          <Select
            value={selectedModel.video}
            onValueChange={(v) => setSelectedModel({ video: v as VideoModel })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(VIDEO_MODEL_LABELS) as [VideoModel, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* TTS Model */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">TTS Model</p>
          <Select
            value={selectedModel.tts}
            onValueChange={(v) => setSelectedModel({ tts: v as TTSModel })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(TTS_MODEL_LABELS) as [TTSModel, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
