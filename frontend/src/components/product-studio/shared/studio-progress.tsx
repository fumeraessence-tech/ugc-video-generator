"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDIO_STEPS, type StudioStep } from "@/stores/product-studio-store";

export function StudioProgress({
  currentStep,
  onStepClick,
  completedSteps = [],
}: {
  currentStep: StudioStep;
  onStepClick?: (step: StudioStep) => void;
  completedSteps?: StudioStep[];
}) {
  const currentIdx = STUDIO_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-2">
      {STUDIO_STEPS.map((step, idx) => {
        const isActive = step.key === currentStep;
        const isCompleted = completedSteps.includes(step.key) || idx < currentIdx;
        const isClickable = onStepClick && (isCompleted || idx <= currentIdx + 1);

        return (
          <div key={step.key} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick?.(step.key)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                isActive && "bg-foreground text-background",
                isCompleted && !isActive && "bg-foreground/10 text-foreground hover:bg-foreground/20",
                !isActive && !isCompleted && "bg-muted text-muted-foreground",
                isClickable && !isActive && "cursor-pointer",
                !isClickable && "cursor-default opacity-50"
              )}
            >
              {isCompleted && !isActive ? (
                <Check className="size-3" />
              ) : (
                <span className="size-4 flex items-center justify-center rounded-full text-[10px] font-bold">
                  {step.number}
                </span>
              )}
              {step.label}
            </button>
            {idx < STUDIO_STEPS.length - 1 && (
              <div
                className={cn(
                  "w-6 h-px mx-1",
                  idx < currentIdx ? "bg-foreground/30" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
