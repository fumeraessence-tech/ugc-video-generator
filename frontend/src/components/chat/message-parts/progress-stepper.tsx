"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "completed" | "active" | "pending";

interface PipelineStep {
  label: string;
  status: StepStatus;
}

interface ProgressStepperProps {
  steps: PipelineStep[];
}

const DEFAULT_STEPS: PipelineStep[] = [
  { label: "Script", status: "pending" },
  { label: "Storyboard", status: "pending" },
  { label: "Video", status: "pending" },
  { label: "Audio", status: "pending" },
  { label: "Final", status: "pending" },
];

export function ProgressStepper({
  steps = DEFAULT_STEPS,
}: ProgressStepperProps) {
  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 p-4">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                  step.status === "completed" &&
                    "border-foreground bg-foreground text-background",
                  step.status === "active" &&
                    "border-foreground text-foreground",
                  step.status === "pending" &&
                    "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {step.status === "completed" ? (
                  <Check className="size-3.5" />
                ) : step.status === "active" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-xs",
                  step.status === "pending"
                    ? "text-muted-foreground"
                    : "text-foreground font-medium"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-px w-8 sm:w-12",
                  step.status === "completed"
                    ? "bg-foreground"
                    : "bg-muted-foreground/30"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
