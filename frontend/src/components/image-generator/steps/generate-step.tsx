"use client";

import { useCallback } from "react";
import { useImageGeneratorStore, type GeneratedImage } from "@/stores/image-generator-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, Check, AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Shot Types ──────────────────────────────────────────────────

const SHOT_TYPES: { key: string; label: string }[] = [
  { key: "hero_replace", label: "Hero Shot" },
  { key: "with_box", label: "With Box" },
  { key: "single_shot", label: "Single Shot" },
  { key: "dynamic_angle", label: "Dynamic Angle" },
  { key: "detail_closeup", label: "Detail Close-up" },
];

// ─── Component ──────────────────────────────────────────────────

export function GenerateStep() {
  const {
    productImages,
    bottleImages,
    boxImages,
    referenceImages,
    productName,
    brandName,
    liquidColor,
    productDNA,
    generatedImages,
    setGeneratedImages,
    addGeneratedImage,
    updateGeneratedImage,
    isGenerating,
    setIsGenerating,
    setError,
    error,
    nextStep,
  } = useImageGeneratorStore();

  // Count completed / total
  const doneCount = generatedImages.filter((img) => img.status === "done").length;
  const errorCount = generatedImages.filter((img) => img.status === "error").length;
  const generatingIndex = generatedImages.findIndex((img) => img.status === "generating");
  const totalCount = SHOT_TYPES.length;
  const allDone = generatedImages.length === totalCount && doneCount + errorCount === totalCount;
  const progressPercent = totalCount > 0 ? ((doneCount + errorCount) / totalCount) * 100 : 0;

  // ─── SSE Generation ─────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    // Initialize placeholders
    const placeholders: GeneratedImage[] = SHOT_TYPES.map((shot) => ({
      id: shot.key,
      shotType: shot.key,
      label: shot.label,
      imageUrl: "",
      prompt: "",
      status: "pending",
    }));
    setGeneratedImages(placeholders);

    try {
      const response = await fetch("/api/image-generator/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_images: productImages,
          bottle_images: bottleImages,
          box_images: boxImages,
          reference_images: referenceImages,
          product_name: productName,
          brand_name: brandName,
          liquid_color: liquidColor,
          product_dna: productDNA,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Generation failed: ${response.status} ${text}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on CRLF or LF (sse-starlette uses CRLF)
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === "generating") {
                // Mark the shot as generating
                const shotType = data.shot_type;
                if (shotType) {
                  updateGeneratedImage(shotType, { status: "generating" });
                }
              } else if (currentEvent === "image") {
                // Image completed
                const shotType = data.shot_type;
                if (shotType) {
                  updateGeneratedImage(shotType, {
                    status: "done",
                    imageUrl: data.image_url || "",
                    prompt: data.prompt || "",
                  });
                }
              } else if (currentEvent === "error") {
                const shotType = data.shot_type;
                if (shotType) {
                  updateGeneratedImage(shotType, {
                    status: "error",
                    error: data.message || "Generation failed",
                  });
                } else {
                  setError(data.message || "Generation failed");
                }
              } else if (currentEvent === "complete") {
                setIsGenerating(false);
              }
            } catch {
              // Ignore malformed JSON lines
            }

            currentEvent = "";
          }
        }
      }

      // Ensure generating is set to false when stream ends
      setIsGenerating(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setIsGenerating(false);
    }
  }, [
    productImages,
    bottleImages,
    boxImages,
    referenceImages,
    productName,
    brandName,
    liquidColor,
    productDNA,
    setGeneratedImages,
    updateGeneratedImage,
    setIsGenerating,
    setError,
  ]);

  // ─── Status helpers ─────────────────────────────────────────

  function getImageForShot(shotKey: string): GeneratedImage | undefined {
    return generatedImages.find((img) => img.id === shotKey);
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Generate Product Images</h2>
        <p className="text-muted-foreground">
          Generate 5 professional product shots using AI. Each shot type captures
          your product from a different perspective.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Generate button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2 px-8"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Generating...
            </>
          ) : generatedImages.length > 0 ? (
            <>
              <Sparkles className="size-5" />
              Regenerate All
            </>
          ) : (
            <>
              <Sparkles className="size-5" />
              Generate Images
            </>
          )}
        </Button>
      </div>

      {/* Progress bar (visible during generation) */}
      {isGenerating && (
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">
            Generating {Math.min(doneCount + errorCount + 1, totalCount)} of{" "}
            {totalCount}...
          </p>
        </div>
      )}

      {/* Shot type grid */}
      {generatedImages.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHOT_TYPES.map((shot) => {
            const img = getImageForShot(shot.key);
            const status = img?.status || "pending";

            return (
              <Card
                key={shot.key}
                className={cn(
                  "overflow-hidden transition-all",
                  status === "generating" && "ring-2 ring-primary/50",
                  status === "error" && "ring-2 ring-destructive/50"
                )}
              >
                <CardContent className="p-0">
                  {/* Image area */}
                  <div className="relative aspect-square bg-muted">
                    {status === "pending" && (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <div className="mx-auto mb-2 size-10 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                            <Sparkles className="size-5 text-muted-foreground/50" />
                          </div>
                          <p className="text-sm font-medium">{shot.label}</p>
                          <p className="text-xs">Waiting...</p>
                        </div>
                      </div>
                    )}

                    {status === "generating" && (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="mx-auto mb-2 size-8 animate-spin text-primary" />
                          <p className="text-sm font-medium">{shot.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Generating...
                          </p>
                        </div>
                      </div>
                    )}

                    {status === "done" && img?.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={img.imageUrl}
                        alt={shot.label}
                        className="h-full w-full object-cover"
                      />
                    )}

                    {status === "error" && (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center text-destructive">
                          <AlertCircle className="mx-auto mb-2 size-8" />
                          <p className="text-sm font-medium">{shot.label}</p>
                          <p className="text-xs">
                            {img?.error || "Failed"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Status badge overlay */}
                    {status === "done" && (
                      <div className="absolute right-2 top-2 rounded-full bg-green-500 p-1 text-white shadow-sm">
                        <Check className="size-3" />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium">{shot.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View Gallery button */}
      {allDone && doneCount > 0 && (
        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={nextStep} className="gap-2 px-8">
            View Gallery
            <ArrowRight className="size-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
