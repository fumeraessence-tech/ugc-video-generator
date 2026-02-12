"use client";

import { useCallback } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useProductStudioStore,
  STUDIO_STEPS,
  type StudioStep,
} from "@/stores/product-studio-store";
import { StudioProgress } from "./shared/studio-progress";
import { StepUpload } from "./steps/step-upload";
import { StepWhiteBg } from "./steps/step-white-bg";
import { StepInspiration } from "./steps/step-inspiration";
import { StepReview } from "./steps/step-review";

const STEP_COMPONENTS: Record<StudioStep, React.FC> = {
  upload: StepUpload,
  "white-bg": StepWhiteBg,
  inspiration: StepInspiration,
  review: StepReview,
};

export function ProductStudioPage() {
  const store = useProductStudioStore();
  const currentStep = store.currentStep;
  const currentIdx = STUDIO_STEPS.findIndex((s) => s.key === currentStep);
  const StepComponent = STEP_COMPONENTS[currentStep];

  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case "upload":
        return store.csvProducts.length > 0 && store.selectedProductIndices.length > 0;
      case "white-bg":
        return store.whiteBgResults.length > 0;
      case "inspiration":
        return true;
      case "review":
        return false;
      default:
        return false;
    }
  }, [currentStep, store.csvProducts.length, store.selectedProductIndices.length, store.whiteBgResults.length]);

  const completedSteps = STUDIO_STEPS.filter((_, idx) => idx < currentIdx).map((s) => s.key);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Product Studio</h1>
              <p className="text-xs text-muted-foreground">
                CSV to ecommerce images in minutes
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Reset all data and start over?")) {
                  store.reset();
                }
              }}
            >
              <RotateCcw className="size-3 mr-1.5" />
              Reset
            </Button>
          </div>

          <StudioProgress
            currentStep={currentStep}
            onStepClick={(step) => store.setCurrentStep(step)}
            completedSteps={completedSteps}
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">
        <StepComponent />
      </div>

      {/* Footer Nav */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={store.prevStep}
            disabled={currentIdx === 0}
          >
            <ChevronLeft className="size-3 mr-1" />
            Back
          </Button>

          <span className="text-xs text-muted-foreground">
            Step {currentIdx + 1} of {STUDIO_STEPS.length}
          </span>

          <Button
            size="sm"
            onClick={store.nextStep}
            disabled={currentIdx >= STUDIO_STEPS.length - 1 || !canGoNext()}
          >
            Next
            <ChevronRight className="size-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
