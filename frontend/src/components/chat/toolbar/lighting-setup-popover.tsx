"use client"

import { Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useChatStore } from "@/stores/chat-store"
import {
  LIGHTING_TYPE_LABELS,
  LIGHTING_DIRECTION_LABELS,
  COLOR_TEMP_LABELS,
  LIGHTING_INTENSITY_LABELS,
} from "@/types/generation"
import type { LightingType, LightingDirection, ColorTemperature, LightingIntensity } from "@/types/generation"

export function LightingSetupPopover() {
  const lightingSetup = useChatStore((s) => s.lightingSetup)
  const setLightingSetup = useChatStore((s) => s.setLightingSetup)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Sun className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <p className="text-sm font-medium">Lighting Setup</p>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Type</p>
          <Select value={lightingSetup.type} onValueChange={(v) => setLightingSetup({ type: v as LightingType })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(LIGHTING_TYPE_LABELS) as [LightingType, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Direction</p>
          <Select value={lightingSetup.direction} onValueChange={(v) => setLightingSetup({ direction: v as LightingDirection })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(LIGHTING_DIRECTION_LABELS) as [LightingDirection, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Color Temperature</p>
          <Select value={lightingSetup.colorTemp} onValueChange={(v) => setLightingSetup({ colorTemp: v as ColorTemperature })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(COLOR_TEMP_LABELS) as [ColorTemperature, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Intensity</p>
          <Select value={lightingSetup.intensity} onValueChange={(v) => setLightingSetup({ intensity: v as LightingIntensity })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(LIGHTING_INTENSITY_LABELS) as [LightingIntensity, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
