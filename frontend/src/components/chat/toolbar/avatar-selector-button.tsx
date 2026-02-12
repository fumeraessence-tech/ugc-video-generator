"use client"

import * as React from "react"
import { User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/stores/chat-store"
import { AvatarSelector } from "@/components/avatars/avatar-selector"

// System avatars with their DNA (same as avatar-step.tsx)
const SYSTEM_AVATARS: Record<string, { name: string; thumbnail: string | null; dna: Record<string, string> | null }> = {
  "system-sarah": {
    name: "Sarah",
    thumbnail: "/avatars/sarah-thumb.jpg",
    dna: {
      face: "oval face, soft jawline, high cheekbones",
      skin: "light beige, clear complexion, natural glow",
      eyes: "large brown eyes, natural lashes",
      hair: "shoulder-length wavy brown hair",
      body: "average build, 5'6\"",
      voice: "warm, friendly, mid-range female voice",
      wardrobe: "casual streetwear, earth tones",
      prohibited_drift: "no tattoos, no piercings beyond ears, consistent hair color",
    },
  },
  "system-marcus": {
    name: "Marcus",
    thumbnail: "/avatars/marcus-thumb.jpg",
    dna: {
      face: "square jaw, defined cheekbones",
      skin: "medium brown, even tone",
      eyes: "dark brown eyes, strong brow line",
      hair: "short fade, black hair",
      body: "athletic build, 6'0\"",
      voice: "deep, confident, clear enunciation",
      wardrobe: "clean minimalist, solid colors, tech-casual",
      prohibited_drift: "no facial hair changes, consistent haircut",
    },
  },
  "system-priya": {
    name: "Priya",
    thumbnail: "/avatars/priya-thumb.jpg",
    dna: {
      face: "oval face, delicate features, soft smile",
      skin: "warm olive, smooth complexion",
      eyes: "large dark brown eyes, thick natural lashes",
      hair: "long straight black hair, sometimes worn loose or in a low ponytail",
      body: "petite build, 5'4\"",
      voice: "gentle, melodic, slight warmth",
      wardrobe: "elegant casual, soft pastels and jewel tones",
      prohibited_drift: "no dramatic hair changes, consistent warm undertone in makeup",
    },
  },
};

export function AvatarSelectorButton() {
  const [open, setOpen] = React.useState(false)
  const [avatarName, setAvatarName] = React.useState<string | null>(null)
  const selectedAvatarId = useChatStore((s) => s.selectedAvatarId)
  const setSelectedAvatarId = useChatStore((s) => s.setSelectedAvatarId)
  const setAvatarReferenceImages = useChatStore((s) => s.setAvatarReferenceImages)
  const setAvatarDNA = useChatStore((s) => s.setAvatarDNA)

  // Fetch avatar data when selection changes
  React.useEffect(() => {
    if (!selectedAvatarId || selectedAvatarId === "no-avatar") {
      setAvatarName(null)
      setAvatarReferenceImages([])
      setAvatarDNA(null)
      return
    }

    // Check if it's a system avatar first
    const systemAvatar = SYSTEM_AVATARS[selectedAvatarId]
    if (systemAvatar) {
      setAvatarName(systemAvatar.name)
      setAvatarDNA(systemAvatar.dna)
      if (systemAvatar.thumbnail) {
        setAvatarReferenceImages([systemAvatar.thumbnail])
      } else {
        setAvatarReferenceImages([])
      }
      return
    }

    // Fetch custom avatar from API
    fetch(`/api/avatars/${selectedAvatarId}`)
      .then((r) => r.json())
      .then((data) => {
        console.log("✅ Fetched avatar data:", {
          id: data.id,
          name: data.name,
          dna: data.dna,
          referenceImages: data.referenceImages,
          thumbnailUrl: data.thumbnailUrl,
        })
        setAvatarName(data.name ?? null)
        if (data.dna) {
          setAvatarDNA(data.dna)
        }
        // Use referenceImages (camelCase from Prisma) if available, otherwise use thumbnail
        if (data.referenceImages && data.referenceImages.length > 0) {
          console.log("✅ Setting avatar reference images:", data.referenceImages)
          setAvatarReferenceImages(data.referenceImages)
        } else if (data.thumbnailUrl) {
          console.log("✅ Using thumbnail as reference:", data.thumbnailUrl)
          setAvatarReferenceImages([data.thumbnailUrl])
        } else {
          console.log("⚠️ No reference images found for avatar")
          setAvatarReferenceImages([])
        }
      })
      .catch((err) => {
        console.error("❌ Failed to fetch avatar:", err)
        setAvatarName(null)
        setAvatarReferenceImages([])
        setAvatarDNA(null)
      })
  }, [selectedAvatarId, setAvatarReferenceImages, setAvatarDNA])

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <User className="size-4" />
        {avatarName ?? "No Avatar"}
      </Button>
      <AvatarSelector
        open={open}
        onOpenChange={setOpen}
        selectedId={selectedAvatarId}
        onSelect={setSelectedAvatarId}
      />
    </>
  )
}
