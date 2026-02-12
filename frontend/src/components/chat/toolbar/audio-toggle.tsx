"use client"

import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/stores/chat-store"
import { cn } from "@/lib/utils"

export function AudioToggle() {
  const audioEnabled = useChatStore((s) => s.audioEnabled)
  const setAudioEnabled = useChatStore((s) => s.setAudioEnabled)

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8",
        audioEnabled
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={() => setAudioEnabled(!audioEnabled)}
    >
      {audioEnabled ? (
        <Volume2 className="size-4" />
      ) : (
        <VolumeX className="size-4" />
      )}
    </Button>
  )
}
