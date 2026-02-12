"use client";

import { useCallback } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  usePerfumeStudioStore,
  WIZARD_STEPS,
  type WizardStep,
} from "@/stores/perfume-studio-store";
import { PipelineProgress } from "./shared/pipeline-progress";
import { StepReferences } from "./steps/step-references";
import { StepCSVUpload } from "./steps/step-csv-upload";
import { StepAvatars } from "./steps/step-avatars";
import { StepInspiration } from "./steps/step-inspiration";
import { StepConfigure } from "./steps/step-configure";
import { StepGenerate } from "./steps/step-generate";
import { StepReview } from "./steps/step-review";
import { StepHistory } from "./steps/step-history";

const STEP_COMPONENTS: Record<WizardStep, React.FC> = {
  references: StepReferences,
  csv: StepCSVUpload,
  avatars: StepAvatars,
  inspiration: StepInspiration,
  configure: StepConfigure,
  generate: StepGenerate,
  review: StepReview,
  history: StepHistory,
};

export function PerfumeStudioPage() {
  const store = usePerfumeStudioStore();
  const currentStep = store.currentStep;
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.key === currentStep);
  const StepComponent = STEP_COMPONENTS[currentStep];

  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case "references":
        return store.bottleImage || store.capImage || store.labelImages.length > 0;
      case "csv":
        return store.csvProducts.length > 0;
      case "avatars":
        return true; // Optional step
      case "inspiration":
        return true; // Optional step
      case "configure":
        return true;
      case "generate":
        return store.batchStatus === "completed" || store.batchResults.length > 0;
      case "review":
        return true;
      default:
        return false;
    }
  }, [currentStep, store]);

  const completedSteps = WIZARD_STEPS
    .filter((_, idx) => idx < currentIdx)
    .map((s) => s.key);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold">Perfume Studio</h1>
              <p className="text-xs text-muted-foreground">
                Product image generation pipeline
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

          <PipelineProgress
            currentStep={currentStep}
            onStepClick={(step) => store.setCurrentStep(step)}
            completedSteps={completedSteps}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <StepComponent />
      </div>

      {/* Footer Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur-sm">
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
            Step {currentIdx + 1} of {WIZARD_STEPS.length}
          </span>

          <Button
            size="sm"
            onClick={store.nextStep}
            disabled={currentIdx >= WIZARD_STEPS.length - 1 || !canGoNext()}
          >
            Next
            <ChevronRight className="size-3 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
