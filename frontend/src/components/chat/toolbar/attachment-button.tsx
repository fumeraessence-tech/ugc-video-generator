"use client"

import * as React from "react"
import { Plus, UserCircle, Package, Sparkles, FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type ImageClassification =
  | "character_reference"
  | "product_image"
  | "scene_inspiration"
  | "other"

interface AttachmentButtonProps {
  onAttach: (files: File[], classification?: ImageClassification) => void
  disabled?: boolean
  showClassification?: boolean
}

const CLASSIFICATIONS: {
  value: ImageClassification
  label: string
  description: string
  icon: React.ElementType
}[] = [
  {
    value: "character_reference",
    label: "Character Reference",
    description: "Photo of the person/avatar for the video",
    icon: UserCircle,
  },
  {
    value: "product_image",
    label: "Product Image",
    description: "Photo of the product being featured",
    icon: Package,
  },
  {
    value: "scene_inspiration",
    label: "Scene Inspiration",
    description: "Visual reference for style or scene mood",
    icon: Sparkles,
  },
  {
    value: "other",
    label: "Other",
    description: "General attachment",
    icon: FileQuestion,
  },
]

export function AttachmentButton({
  onAttach,
  disabled,
  showClassification = true,
}: AttachmentButtonProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([])
  const [showPopover, setShowPopover] = React.useState(false)

  const handleFilesSelected = (files: File[]) => {
    if (!showClassification) {
      onAttach(files)
      return
    }

    // Check if any are images — only images need classification
    const hasImages = files.some((f) => f.type.startsWith("image/"))
    if (!hasImages) {
      onAttach(files)
      return
    }

    setPendingFiles(files)
    setShowPopover(true)
  }

  const handleClassify = (classification: ImageClassification) => {
    onAttach(pendingFiles, classification)
    setPendingFiles([])
    setShowPopover(false)
  }

  return (
    <Popover open={showPopover} onOpenChange={setShowPopover}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-56 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          What is this image?
        </p>
        {CLASSIFICATIONS.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.value}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent transition-colors"
              onClick={() => handleClassify(c.value)}
            >
              <Icon className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-medium">{c.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.description}
                </p>
              </div>
            </button>
          )
        })}
      </PopoverContent>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) {
            handleFilesSelected(files)
          }
          e.target.value = ""
        }}
      />
    </Popover>
  )
}
