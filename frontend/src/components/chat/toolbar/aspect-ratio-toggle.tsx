"use client"

import { useChatStore } from "@/stores/chat-store"
import { cn } from "@/lib/utils"
import type { AspectRatio } from "@/types/generation"

const options: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
]

export function AspectRatioToggle() {
  const aspectRatio = useChatStore((s) => s.aspectRatio)
  const setAspectRatio = useChatStore((s) => s.setAspectRatio)

  return (
    <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setAspectRatio(opt.value)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium transition-colors",
            aspectRatio === opt.value
              ? "bg-foreground text-background"
              : "bg-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
