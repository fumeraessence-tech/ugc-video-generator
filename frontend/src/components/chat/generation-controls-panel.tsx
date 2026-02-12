"use client"

import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { useChatStore } from "@/stores/chat-store"
import {
  VIDEO_STYLE_LABELS,
  PLATFORM_LABELS,
  RESOLUTION_LABELS,
  COLOR_GRADING_LABELS,
} from "@/types/generation"
import type {
  VideoStyle,
  Platform,
  Resolution,
  ColorGrading,
} from "@/types/generation"
import { cn } from "@/lib/utils"
import { ProductUpload } from "@/components/generation/product-upload"
import { BackgroundSelector } from "@/components/generation/background-selector"

// Toolbar components absorbed into this panel (Fix 8)
import { GenerationModeSelect } from "@/components/chat/toolbar/generation-mode-select"
import { AspectRatioToggle } from "@/components/chat/toolbar/aspect-ratio-toggle"
import { DurationSelector } from "@/components/chat/toolbar/duration-selector"
import { ModelSelector } from "@/components/chat/toolbar/model-selector"
import { CameraSetupPopover } from "@/components/chat/toolbar/camera-setup-popover"
import { LightingSetupPopover } from "@/components/chat/toolbar/lighting-setup-popover"
import { AudioToggle } from "@/components/chat/toolbar/audio-toggle"

export function GenerationControlsPanel() {
  const videoStyle = useChatStore((s) => s.videoStyle)
  const setVideoStyle = useChatStore((s) => s.setVideoStyle)
  const platform = useChatStore((s) => s.platform)
  const setPlatform = useChatStore((s) => s.setPlatform)
  const resolution = useChatStore((s) => s.resolution)
  const setResolution = useChatStore((s) => s.setResolution)
  const realismFilters = useChatStore((s) => s.realismFilters)
  const setRealismFilters = useChatStore((s) => s.setRealismFilters)
  const colorGrading = useChatStore((s) => s.colorGrading)
  const setColorGrading = useChatStore((s) => s.setColorGrading)
  const productImages = useChatStore((s) => s.productImages)
  const setProductImages = useChatStore((s) => s.setProductImages)
  const productName = useChatStore((s) => s.productName)
  const setProductName = useChatStore((s) => s.setProductName)
  const backgroundSetting = useChatStore((s) => s.backgroundSetting)
  const setBackgroundSetting = useChatStore((s) => s.setBackgroundSetting)

  // Derive indicator dot color for trigger button (Fix 10)
  const hasProductName = Boolean(productName?.trim())
  const hasProductImages = productImages.length > 0
  const isFullyConfigured = hasProductName && hasProductImages
  const isPartiallyConfigured = hasProductName || hasProductImages

  // Build tooltip summary for trigger button
  const tooltipParts: string[] = []
  if (productName?.trim()) {
    tooltipParts.push(`Product: ${productName.trim()}`)
  }
  if (platform) {
    tooltipParts.push(`Platform: ${PLATFORM_LABELS[platform]}`)
  }
  if (videoStyle) {
    tooltipParts.push(`Style: ${VIDEO_STYLE_LABELS[videoStyle]}`)
  }
  const tooltipText = tooltipParts.length > 0
    ? tooltipParts.join(" | ")
    : "Generation Controls"

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          title={tooltipText}
        >
          <SlidersHorizontal className="size-4" />
          {/* Status indicator dot */}
          {isPartiallyConfigured && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                isFullyConfigured
                  ? "bg-green-500"
                  : "bg-amber-500"
              )}
            />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generation Controls</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 py-6">

          {/* ===== 1. Product Details ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Product Details</h3>

            {/* Product Name */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Product Name
              </p>
              <Input
                placeholder="e.g., Moisturizing Face Cream"
                value={productName || ""}
                onChange={(e) => setProductName(e.target.value || null)}
                className="w-full"
              />
            </div>

            {/* Product Images */}
            <ProductUpload
              productImages={productImages}
              onImagesChange={setProductImages}
            />
          </div>

          <Separator />

          {/* ===== 2. Video Settings ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Video Settings</h3>

            {/* Generation Mode */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Generation Mode
              </p>
              <GenerationModeSelect />
            </div>

            {/* Aspect Ratio */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Aspect Ratio
              </p>
              <AspectRatioToggle />
            </div>

            {/* Duration */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Duration
              </p>
              <DurationSelector />
            </div>

            {/* Platform */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Platform
              </p>
              <Select
                value={platform}
                onValueChange={(v) => setPlatform(v as Platform)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(PLATFORM_LABELS) as [Platform, string][]
                  ).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* ===== 3. Background ===== */}
          <BackgroundSelector
            value={backgroundSetting}
            onChange={setBackgroundSetting}
          />

          <Separator />

          {/* ===== 4. Camera & Lighting ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Camera & Lighting</h3>
            <div className="flex items-center gap-2">
              <CameraSetupPopover />
              <LightingSetupPopover />
            </div>
          </div>

          <Separator />

          {/* ===== 5. Audio ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Audio</h3>
            <div className="flex items-center gap-2">
              <AudioToggle />
              <span className="text-xs text-muted-foreground">
                Toggle audio generation
              </span>
            </div>
          </div>

          <Separator />

          {/* ===== 6. Style & Grading ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Style & Grading</h3>

            {/* Video Style */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Video Style
              </p>
              <Select
                value={videoStyle}
                onValueChange={(v) => setVideoStyle(v as VideoStyle)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(VIDEO_STYLE_LABELS) as [VideoStyle, string][]
                  ).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color Grading */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Color Grading
              </p>
              <Select
                value={colorGrading}
                onValueChange={(v) => setColorGrading(v as ColorGrading)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(COLOR_GRADING_LABELS) as [
                      ColorGrading,
                      string,
                    ][]
                  ).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Realism Filters */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Realism Filters
              </p>
              <div className="flex flex-wrap gap-2">
                {(["grain", "vignette", "shake"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() =>
                      setRealismFilters({ [filter]: !realismFilters[filter] })
                    }
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      realismFilters[filter]
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {filter === "grain"
                      ? "Film Grain"
                      : filter === "vignette"
                        ? "Vignette"
                        : "Micro-shake"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* ===== 7. Advanced ===== */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Advanced</h3>

            {/* Model Selector */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Model
              </p>
              <ModelSelector />
            </div>

            {/* Resolution */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Resolution
              </p>
              <Select
                value={resolution}
                onValueChange={(v) => setResolution(v as Resolution)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(RESOLUTION_LABELS) as [Resolution, string][]
                  ).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  )
}
