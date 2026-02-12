"use client"

import { Camera } from "lucide-react"
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
  SHOT_TYPE_LABELS,
  CAMERA_ANGLE_LABELS,
  CAMERA_MOVEMENT_LABELS,
  DOF_LABELS,
} from "@/types/generation"
import type { ShotType, CameraAngle, CameraMovement, DepthOfField } from "@/types/generation"

export function CameraSetupPopover() {
  const cameraSetup = useChatStore((s) => s.cameraSetup)
  const setCameraSetup = useChatStore((s) => s.setCameraSetup)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <Camera className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <p className="text-sm font-medium">Camera Setup</p>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Shot Type</p>
          <Select value={cameraSetup.shotType} onValueChange={(v) => setCameraSetup({ shotType: v as ShotType })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(SHOT_TYPE_LABELS) as [ShotType, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Camera Angle</p>
          <Select value={cameraSetup.angle} onValueChange={(v) => setCameraSetup({ angle: v as CameraAngle })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(CAMERA_ANGLE_LABELS) as [CameraAngle, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Camera Movement</p>
          <Select value={cameraSetup.movement} onValueChange={(v) => setCameraSetup({ movement: v as CameraMovement })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(CAMERA_MOVEMENT_LABELS) as [CameraMovement, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Depth of Field</p>
          <Select value={cameraSetup.dof} onValueChange={(v) => setCameraSetup({ dof: v as DepthOfField })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(DOF_LABELS) as [DepthOfField, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
