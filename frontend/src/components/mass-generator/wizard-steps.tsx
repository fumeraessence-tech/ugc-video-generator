"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { WizardStep } from "@/types/mass-generator";

interface WizardStepsProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
  completedSteps: WizardStep[];
}

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "avatar", label: "Avatar" },
  { id: "brief", label: "Brief" },
  { id: "script", label: "Script" },
  { id: "generate", label: "Storyboard" },
  { id: "video", label: "Video" },
];

export function WizardSteps({
  currentStep,
  onStepClick,
  completedSteps,
}: WizardStepsProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isCurrent = step.id === currentStep;
        const isPast = index < currentIndex;
        const canClick = isCompleted || isPast || index === currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            <button
              type="button"
              onClick={() => canClick && onStepClick(step.id)}
              disabled={!canClick}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && !isCurrent && "bg-green-500/10 text-green-600",
                !isCurrent && !isCompleted && "bg-muted text-muted-foreground",
                canClick && "cursor-pointer hover:opacity-80",
                !canClick && "cursor-not-allowed opacity-50"
              )}
            >
              {isCompleted && !isCurrent ? (
                <Check className="size-4" />
              ) : (
                <span
                  className={cn(
                    "size-5 rounded-full flex items-center justify-center text-xs",
                    isCurrent && "bg-primary-foreground/20",
                    !isCurrent && "bg-muted-foreground/20"
                  )}
                >
                  {index + 1}
                </span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 h-0.5 mx-1",
                  index < currentIndex ? "bg-green-500" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
