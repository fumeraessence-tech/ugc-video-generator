"use client";

import { useMemo } from "react";
import { useMassGeneratorStore } from "@/stores/mass-generator-store";
import { WizardSteps } from "./wizard-steps";
import { ProductStep } from "./steps/product-step";
import { AvatarStep } from "./steps/avatar-step";
import { BriefStep } from "./steps/brief-step";
import { ScriptStep } from "./steps/script-step";
import { GenerateStep } from "./steps/generate-step";
import { VideoStep } from "./steps/video-step";
import type { WizardStep } from "@/types/mass-generator";

export function MassGeneratorPanel() {
  const { currentStep, setCurrentStep, productDNA, creativeBrief, script } =
    useMassGeneratorStore();

  // Calculate completed steps
  const completedSteps = useMemo(() => {
    const completed: WizardStep[] = [];
    if (productDNA) completed.push("product");
    if (productDNA) completed.push("avatar"); // Avatar is optional, always "complete" if product is done
    if (creativeBrief) completed.push("brief");
    if (script) completed.push("script");
    return completed;
  }, [productDNA, creativeBrief, script]);

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case "product":
        return <ProductStep />;
      case "avatar":
        return <AvatarStep />;
      case "brief":
        return <BriefStep />;
      case "script":
        return <ScriptStep />;
      case "generate":
        return <GenerateStep />;
      case "video":
        return <VideoStep />;
      default:
        return <ProductStep />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Wizard Steps Header */}
      <div className="border-b bg-card/50 px-4">
        <WizardSteps
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          completedSteps={completedSteps}
        />
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">{renderStep()}</div>
      </div>
    </div>
  );
}
