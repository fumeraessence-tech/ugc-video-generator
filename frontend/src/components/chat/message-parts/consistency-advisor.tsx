"use client";

import {
  Check,
  AlertTriangle,
  Camera,
  ImagePlus,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AngleCoverage {
  front?: string;
  left_profile?: string;
  right_profile?: string;
  back?: string;
  three_quarter_left?: string;
  three_quarter_right?: string;
}

interface ConsistencyAdvisorProps {
  avatarName?: string;
  angleCoverage?: AngleCoverage;
  previousScores?: Array<{ scene: string | number; score: number }>;
  onUploadAngle?: (angle: string) => void;
  onAddReferences?: () => void;
}

const REQUIRED_ANGLES = [
  { key: "front", label: "Front" },
  { key: "left_profile", label: "Left Side" },
  { key: "right_profile", label: "Right Side" },
] as const;

const OPTIONAL_ANGLES = [
  { key: "back", label: "Back" },
  { key: "three_quarter_left", label: "3/4 Left" },
  { key: "three_quarter_right", label: "3/4 Right" },
] as const;

export function ConsistencyAdvisor({
  avatarName,
  angleCoverage,
  previousScores,
  onUploadAngle,
  onAddReferences,
}: ConsistencyAdvisorProps) {
  const coverage = angleCoverage || {};
  const requiredCount = REQUIRED_ANGLES.filter(
    (a) => coverage[a.key as keyof AngleCoverage]
  ).length;
  const isComplete = requiredCount === REQUIRED_ANGLES.length;

  const avgScore = previousScores?.length
    ? previousScores.reduce((sum, s) => sum + s.score, 0) /
      previousScores.length
    : null;

  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Camera className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium">
          Character Consistency{avatarName ? ` — ${avatarName}` : ""}
        </span>
        {isComplete ? (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-green-600 font-medium">
            <Check className="size-3" /> All angles covered
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600 font-medium">
            <AlertTriangle className="size-3" /> {requiredCount}/
            {REQUIRED_ANGLES.length} required
          </span>
        )}
      </div>

      {/* Required angles */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {REQUIRED_ANGLES.map((angle) => {
          const hasImage = !!coverage[angle.key as keyof AngleCoverage];
          return (
            <div
              key={angle.key}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-2",
                hasImage
                  ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                  : "border-dashed border-muted-foreground/30"
              )}
            >
              {hasImage ? (
                <Check className="size-4 text-green-600" />
              ) : onUploadAngle ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onUploadAngle(angle.key)}
                >
                  <ImagePlus className="size-4" />
                </button>
              ) : (
                <AlertTriangle className="size-4 text-amber-500" />
              )}
              <span className="text-[10px] text-muted-foreground">
                {angle.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Optional angles (collapsed) */}
      <div className="flex flex-wrap gap-1 mb-2">
        {OPTIONAL_ANGLES.map((angle) => {
          const hasImage = !!coverage[angle.key as keyof AngleCoverage];
          return (
            <span
              key={angle.key}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded",
                hasImage
                  ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {hasImage ? "✓" : "○"} {angle.label}
            </span>
          );
        })}
      </div>

      {/* Previous consistency scores */}
      {previousScores && previousScores.length > 0 && (
        <div className="border-t pt-2 mt-2">
          <p className="text-[10px] text-muted-foreground mb-1">
            Previous generation scores
          </p>
          <div className="flex gap-1 flex-wrap">
            {previousScores.map((s) => (
              <span
                key={String(s.scene)}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  s.score >= 0.85
                    ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : s.score >= 0.75
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                )}
              >
                S{s.scene}: {Math.round(s.score * 100)}%
              </span>
            ))}
          </div>
          {avgScore !== null && avgScore < 0.8 && (
            <p className="text-[10px] text-amber-600 mt-1">
              Average {Math.round(avgScore * 100)}% — adding more reference
              angles will improve consistency.
            </p>
          )}
        </div>
      )}

      {/* CTA */}
      {!isComplete && onAddReferences && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs mt-2"
          onClick={onAddReferences}
        >
          <ImagePlus className="size-3 mr-1" />
          Add Reference Images
          <ChevronRight className="size-3 ml-auto" />
        </Button>
      )}
    </div>
  );
}
