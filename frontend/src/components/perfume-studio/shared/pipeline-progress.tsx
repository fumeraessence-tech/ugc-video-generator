"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIZARD_STEPS, type WizardStep } from "@/stores/perfume-studio-store";

export function PipelineProgress({
  currentStep,
  onStepClick,
  completedSteps = [],
}: {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
  completedSteps?: WizardStep[];
}) {
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {WIZARD_STEPS.map((step, idx) => {
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
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                isActive && "bg-primary text-primary-foreground shadow-sm",
                isCompleted && !isActive && "bg-green-500/10 text-green-600 hover:bg-green-500/20",
                !isActive && !isCompleted && "bg-muted text-muted-foreground",
                isClickable && !isActive && "cursor-pointer hover:bg-muted/80",
                !isClickable && "cursor-default opacity-60"
              )}
            >
              {isCompleted && !isActive ? (
                <Check className="size-3" />
              ) : (
                <span className="size-4 flex items-center justify-center rounded-full bg-current/10 text-[10px]">
                  {step.number}
                </span>
              )}
              {step.label}
            </button>
            {idx < WIZARD_STEPS.length - 1 && (
              <div className={cn(
                "w-4 h-px mx-0.5",
                idx < currentIdx ? "bg-green-500/40" : "bg-muted-foreground/20"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
