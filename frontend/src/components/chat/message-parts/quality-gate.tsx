"use client";

import { useState } from "react";
import { Check, RotateCcw, ImagePlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SceneScore {
  scene: string | number;
  score: number;
}

interface QualityGateProps {
  jobId: string;
  scores: SceneScore[];
  threshold?: number;
  onAccept?: () => void;
  onRegenerateOutliers?: (sceneNumbers: number[]) => void;
  onRegenerateAll?: () => void;
  onAddReferences?: () => void;
}

export function QualityGate({
  jobId,
  scores,
  threshold = 0.75,
  onAccept,
  onRegenerateOutliers,
  onRegenerateAll,
  onAddReferences,
}: QualityGateProps) {
  const [decided, setDecided] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const avgScore =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      : 0;

  const outliers = scores.filter((s) => s.score < threshold);
  const hasOutliers = outliers.length > 0;

  const handleAction = (action: string) => {
    setDecided(true);
    setSelectedAction(action);

    switch (action) {
      case "accept":
        onAccept?.();
        break;
      case "regenerate_outliers":
        onRegenerateOutliers?.(outliers.map((s) => Number(s.scene)));
        break;
      case "regenerate_all":
        onRegenerateAll?.();
        break;
      case "add_references":
        onAddReferences?.();
        break;
    }
  };

  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 overflow-hidden">
      <div className="p-3 border-b bg-secondary/20">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">Quality Gate — Storyboard Review</h4>
          <Badge
            variant={avgScore >= 0.85 ? "default" : avgScore >= threshold ? "secondary" : "destructive"}
          >
            Avg: {Math.round(avgScore * 100)}%
          </Badge>
        </div>
      </div>

      {/* Per-scene score bars */}
      <div className="p-3 space-y-1.5">
        {scores.map((s) => {
          const isOutlier = s.score < threshold;
          const pct = Math.round(s.score * 100);

          return (
            <div key={String(s.scene)} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                Scene {s.scene}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOutlier
                      ? "bg-red-500"
                      : s.score >= 0.85
                        ? "bg-green-500"
                        : "bg-amber-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium w-8 text-right",
                  isOutlier ? "text-red-600" : "text-muted-foreground"
                )}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {!decided ? (
        <div className="p-3 border-t bg-secondary/10 space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            {hasOutliers
              ? `${outliers.length} scene(s) below ${Math.round(threshold * 100)}% threshold. Choose an action:`
              : "All scenes meet consistency threshold. Continue?"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleAction("accept")}
            >
              <Check className="size-3 mr-1" />
              Accept & Continue
            </Button>
            {hasOutliers && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleAction("regenerate_outliers")}
              >
                <RotateCcw className="size-3 mr-1" />
                Regenerate Outliers ({outliers.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleAction("regenerate_all")}
            >
              <RotateCcw className="size-3 mr-1" />
              Regenerate All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => handleAction("add_references")}
            >
              <ImagePlus className="size-3 mr-1" />
              Add References
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t bg-secondary/10">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Check className="size-3 text-green-600" />
            Decision:{" "}
            {selectedAction === "accept"
              ? "Accepted, continuing to video generation"
              : selectedAction === "regenerate_outliers"
                ? `Regenerating ${outliers.length} outlier scene(s)`
                : selectedAction === "regenerate_all"
                  ? "Regenerating all scenes"
                  : "Adding more reference images"}
          </p>
        </div>
      )}
    </div>
  );
}
