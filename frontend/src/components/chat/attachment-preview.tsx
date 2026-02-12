"use client"

import * as React from "react"
import { X, Film } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface AttachmentFile {
  id: string
  file: File
  previewUrl: string
  type: "image" | "video"
}

interface AttachmentPreviewProps {
  attachments: AttachmentFile[]
  onRemove: (id: string) => void
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="relative flex-shrink-0 rounded-lg border border-border overflow-hidden bg-secondary group"
        >
          {att.type === "image" ? (
            <img
              src={att.previewUrl}
              alt="Attachment"
              className="h-20 w-20 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 flex-col items-center justify-center gap-1">
              <Film className="size-6 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground truncate max-w-[72px] px-1">
                {att.file.name}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onRemove(att.id)}
          >
            <X className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
