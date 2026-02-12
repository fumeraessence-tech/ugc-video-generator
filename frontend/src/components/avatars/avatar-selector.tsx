"use client"

import * as React from "react"
import { Plus, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface AvatarData {
  id: string
  name: string
  tag: string | null
  isSystem: boolean
  thumbnailUrl: string | null
  dna: Record<string, unknown> | null
}

interface AvatarSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function summarizeDna(dna: Record<string, unknown> | null): string {
  if (!dna) return ""
  const parts: string[] = []
  if (dna.face) parts.push(String(dna.face).split(",")[0])
  if (dna.hair) parts.push(String(dna.hair).split(",")[0])
  if (dna.skin) parts.push(String(dna.skin).split(",")[0])
  return parts.join(" · ")
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function AvatarSelector({ open, onOpenChange, selectedId, onSelect }: AvatarSelectorProps) {
  const [avatars, setAvatars] = React.useState<AvatarData[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/avatars")
      .then((r) => r.json())
      .then((data) => setAvatars(Array.isArray(data) ? data : []))
      .catch(() => setAvatars([]))
      .finally(() => setLoading(false))
  }, [open])

  const handleSelect = (id: string | null) => {
    onSelect(id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Avatar</DialogTitle>
        </DialogHeader>

        {/* None option */}
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary",
            selectedId === null && "border-foreground bg-secondary"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <User className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No Avatar</p>
            <p className="text-xs text-muted-foreground">Generate without a specific character</p>
          </div>
        </button>

        {/* Avatar grid */}
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => handleSelect(avatar.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:bg-secondary",
                    selectedId === avatar.id && "border-foreground bg-secondary"
                  )}
                >
                  {/* Thumbnail */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-700 overflow-hidden">
                    {avatar.thumbnailUrl ? (
                      <img
                        src={avatar.thumbnailUrl}
                        alt={avatar.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-medium text-neutral-300">
                        {getInitials(avatar.name)}
                      </span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="w-full min-w-0">
                    <p className="text-sm font-medium truncate">{avatar.name}</p>
                    {avatar.tag && (
                      <p className="text-xs text-muted-foreground truncate">{avatar.tag}</p>
                    )}
                    {avatar.dna && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {summarizeDna(avatar.dna)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Create new */}
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          <Plus className="size-4 mr-2" />
          Create New Avatar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
