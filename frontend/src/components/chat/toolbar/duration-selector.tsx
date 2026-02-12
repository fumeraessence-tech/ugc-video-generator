"use client"

import { useChatStore } from "@/stores/chat-store"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DURATION_OPTIONS } from "@/types/generation"
import type { Duration } from "@/types/generation"

export function DurationSelector() {
  const duration = useChatStore((s) => s.duration)
  const setDuration = useChatStore((s) => s.setDuration)

  return (
    <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as Duration)}>
      <SelectTrigger size="sm" className="w-auto gap-1.5 text-xs font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DURATION_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={String(opt.value)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
