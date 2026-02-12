"use client"

import * as React from "react"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useChatStore } from "@/stores/chat-store"
import { AttachmentButton } from "@/components/chat/toolbar/attachment-button"
import { AvatarSelectorButton } from "@/components/chat/toolbar/avatar-selector-button"
import { GenerationControlsPanel } from "@/components/chat/generation-controls-panel"
import { AttachmentPreview, type AttachmentFile } from "@/components/chat/attachment-preview"

interface ChatInputProps {
  onSend: (content: string, attachments?: AttachmentFile[]) => void
  isStreaming: boolean
  placeholder?: string
  className?: string
}

export function ChatInput({ onSend, isStreaming, placeholder, className }: ChatInputProps) {
  const [value, setValue] = React.useState("")
  const [attachments, setAttachments] = React.useState<AttachmentFile[]>([])
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const selectedAvatarId = useChatStore((s) => s.selectedAvatarId)
  const productName = useChatStore((s) => s.productName)

  const handleAttach = React.useCallback((files: File[]) => {
    const newAttachments: AttachmentFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? "video" : "image",
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  const handleRemoveAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  // Cleanup URLs on unmount
  React.useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = () => {
    const trimmed = value.trim()
    if ((!trimmed && attachments.length === 0) || isStreaming) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue("")
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const hasAvatar = !!selectedAvatarId
  const hasProduct = !!productName

  return (
    <div className={cn("border-t border-border bg-card px-4 py-3", className)}>
      <div className="mx-auto max-w-3xl space-y-2">
        {/* Attachment previews */}
        <AttachmentPreview attachments={attachments} onRemove={handleRemoveAttachment} />

        {/* Mode indicator */}
        <p className="text-[11px] leading-tight flex items-center gap-1.5">
          {hasAvatar && hasProduct ? (
            <>
              <span className="inline-block size-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-emerald-600 dark:text-emerald-400">Ready to generate</span>
            </>
          ) : hasAvatar || hasProduct ? (
            <>
              <span className="inline-block size-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-amber-600 dark:text-amber-400">
                {hasAvatar ? "Add a product to generate videos" : "Add an avatar to generate videos"}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Chat mode — add avatar & product to generate videos
            </span>
          )}
        </p>

        {/* Textarea */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Describe your video scene..."}
            disabled={isStreaming}
            rows={1}
            className="w-full min-h-[44px] resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center gap-1">
          <AttachmentButton onAttach={handleAttach} disabled={isStreaming} />
          <AvatarSelectorButton />
          <GenerationControlsPanel />
          <div className="flex-1" />
          <Button
            size="icon"
            className="h-8 w-8 rounded-full"
            disabled={(!value.trim() && attachments.length === 0) || isStreaming}
            onClick={handleSend}
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
