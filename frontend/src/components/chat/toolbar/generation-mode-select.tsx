"use client"

import { useChatStore } from "@/stores/chat-store"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GENERATION_MODE_LABELS } from "@/types/generation"
import type { GenerationMode } from "@/types/generation"

export function GenerationModeSelect() {
  const generationMode = useChatStore((s) => s.generationMode)
  const setGenerationMode = useChatStore((s) => s.setGenerationMode)

  return (
    <Select value={generationMode} onValueChange={(v) => setGenerationMode(v as GenerationMode)}>
      <SelectTrigger size="sm" className="w-auto gap-1.5 text-xs font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(GENERATION_MODE_LABELS) as [GenerationMode, string][]).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
