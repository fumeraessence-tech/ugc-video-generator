"use client";

import { useImageGeneratorStore, IMAGE_GEN_STEPS, type ImageGenStep } from "@/stores/image-generator-store";
import { ProductSetupStep } from "./steps/product-setup-step";
import { ReferenceStep } from "./steps/reference-step";
import { GenerateStep } from "./steps/generate-step";
import { GalleryStep } from "./steps/gallery-step";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

export function ImageGeneratorPage() {
  const {
    currentStep,
    setCurrentStep,
    nextStep,
    prevStep,
    productImages,
    bottleImages,
    productDNA,
    referenceImages,
    generatedImages,
    isGenerating,
    reset,
  } = useImageGeneratorStore();

  const stepIndex = IMAGE_GEN_STEPS.findIndex((s) => s.key === currentStep);

  // Has at least bottle or product images
  const hasProductImages = bottleImages.length > 0 || productImages.length > 0;

  // Determine which steps are "complete"
  const completedSteps = new Set<ImageGenStep>();
  if (hasProductImages && productDNA) completedSteps.add("product");
  if (referenceImages.length > 0) completedSteps.add("reference");
  if (generatedImages.some((img) => img.status === "done")) completedSteps.add("generate");
  if (generatedImages.some((img) => img.status === "done")) completedSteps.add("gallery");

  // Can we go to next step?
  const canNext = (() => {
    switch (currentStep) {
      case "product":
        return hasProductImages;
      case "reference":
        return referenceImages.length > 0;
      case "generate":
        return generatedImages.some((img) => img.status === "done");
      case "gallery":
        return false; // last step
    }
  })();

  function renderStep() {
    switch (currentStep) {
      case "product":
        return <ProductSetupStep />;
      case "reference":
        return <ReferenceStep />;
      case "generate":
        return <GenerateStep />;
      case "gallery":
        return <GalleryStep />;
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Step Progress Bar */}
      <div className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          {IMAGE_GEN_STEPS.map((step, idx) => {
            const isActive = step.key === currentStep;
            const isComplete = completedSteps.has(step.key);
            const canClick = isComplete || idx <= stepIndex;

            return (
              <div key={step.key} className="flex items-center gap-2">
                {idx > 0 && (
                  <div
                    className={cn(
                      "h-px w-8 sm:w-16",
                      isComplete || idx <= stepIndex
                        ? "bg-primary"
                        : "bg-border"
                    )}
                  />
                )}
                <button
                  onClick={() => canClick && setCurrentStep(step.key)}
                  disabled={!canClick}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive && "bg-primary text-primary-foreground",
                    !isActive && isComplete && "text-primary hover:bg-primary/10",
                    !isActive && !isComplete && "text-muted-foreground"
                  )}
                >
                  {isComplete && !isActive ? (
                    <Check className="size-4" />
                  ) : (
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-xs font-bold",
                        isActive
                          ? "bg-primary-foreground text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {step.number}
                    </span>
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              </div>
            );
          })}

          {/* Reset button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="ml-4 text-muted-foreground"
          >
            <RotateCcw className="mr-1 size-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-6">{renderStep()}</div>

      {/* Bottom Navigation */}
      <div className="border-t bg-card px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={stepIndex === 0}
          >
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>
          {currentStep !== "gallery" && (
            <Button onClick={nextStep} disabled={!canNext || isGenerating}>
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
