"use client";

import { useCallback, useRef } from "react";
import { useBulkGeneratorStore, type BulkGeneratedImage } from "@/stores/bulk-generator-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Square } from "lucide-react";

export function GenerateStep() {
  const {
    csvRows,
    referenceImages,
    boxImages,
    brandName,
    pinterestImages,
    generatedImages,
    isGenerating,
    currentRowIndex,
    totalRows,
    error,
    setGeneratedImages,
    addGeneratedImage,
    updateGeneratedImage,
    setIsGenerating,
    setCurrentRowIndex,
    setTotalRows,
    setError,
    nextStep,
  } = useBulkGeneratorStore();

  const abortRef = useRef<AbortController | null>(null);

  const shotsPerProduct = 8;  // new pipeline always generates 8 shots per product
  const totalExpected = csvRows.length * shotsPerProduct;
  const completedCount = generatedImages.filter((img) => img.status === "done").length;
  const errorCount = generatedImages.filter((img) => img.status === "error").length;
  const progressPercent = totalExpected > 0 ? (completedCount / totalExpected) * 100 : 0;

  const startGeneration = useCallback(async () => {
    setError(null);
    setIsGenerating(true);
    setGeneratedImages([]);
    setCurrentRowIndex(0);
    setTotalRows(csvRows.length);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/bulk-generator/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: csvRows,
          reference_images: referenceImages,
          box_images: boxImages,
          brand_name: brandName,
          per_product_pinterest: pinterestImages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? body?.detail ?? `Generation failed (${res.status})`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === "row_start") {
                setCurrentRowIndex(data.row_index ?? 0);
              } else if (currentEvent === "image") {
                const id = `${data.row_index}-${data.angle}`;
                const newImage: BulkGeneratedImage = {
                  id,
                  productName: data.product_name ?? "",
                  rowIndex: data.row_index ?? 0,
                  angle: data.angle ?? "base",
                  label: data.label ?? "",
                  imageUrl: data.image_url ?? "",
                  status: data.image_url ? "done" : "error",
                  error: data.image_url ? undefined : "No image generated",
                };
                addGeneratedImage(newImage);
              } else if (currentEvent === "error") {
                if (data.angle) {
                  const id = `${data.row_index}-${data.angle}`;
                  addGeneratedImage({
                    id,
                    productName: data.product_name ?? "",
                    rowIndex: data.row_index ?? 0,
                    angle: data.angle ?? "unknown",
                    label: data.label ?? "",
                    imageUrl: "",
                    status: "error",
                    error: data.message ?? "Generation failed",
                  });
                } else {
                  setError(data.message ?? "Generation failed");
                }
              } else if (currentEvent === "skipped") {
                // Shot skipped (no Pinterest ref) — don't count as error
              } else if (currentEvent === "generating") {
                // Status update
              }
            } catch {
              // Skip malformed JSON
            }

            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [csvRows, referenceImages, brandName, pinterestImages, setError, setIsGenerating, setGeneratedImages, setCurrentRowIndex, setTotalRows, addGeneratedImage]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, [setIsGenerating]);

  // Group images by product
  const imagesByProduct = generatedImages.reduce<Record<string, BulkGeneratedImage[]>>(
    (acc, img) => {
      const key = `${img.rowIndex}-${img.productName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(img);
      return acc;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Generate Images</span>
            {!isGenerating && completedCount === 0 && (
              <Button onClick={startGeneration} disabled={csvRows.length === 0}>
                <Play className="mr-1 size-4" />
                Start Generation
              </Button>
            )}
            {isGenerating && (
              <Button variant="destructive" onClick={stopGeneration}>
                <Square className="mr-1 size-4" />
                Stop
              </Button>
            )}
            {!isGenerating && completedCount > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={startGeneration}>
                  Regenerate All
                </Button>
                <Button onClick={nextStep}>
                  View Gallery
                </Button>
              </div>
            )}
          </CardTitle>
          <CardDescription>
            {isGenerating
              ? `Processing product ${currentRowIndex + 1} of ${totalRows}...`
              : completedCount > 0
                ? `Generated ${completedCount} of ${totalExpected} images`
                : `Ready to generate ${totalExpected} images for ${csvRows.length} products`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Progress Bar */}
          {(isGenerating || completedCount > 0) && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {completedCount} / {totalExpected} images
                  {errorCount > 0 && (
                    <span className="ml-2 text-destructive">({errorCount} failed)</span>
                  )}
                </span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Image Results grouped by product */}
          {Object.entries(imagesByProduct).map(([key, images]) => {
            const productName = images[0]?.productName || "Unknown";
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{productName}</h3>
                  <Badge variant="outline" className="text-xs">
                    {images.filter((i) => i.status === "done").length} / 8
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="overflow-hidden rounded-lg border bg-muted"
                    >
                      {img.status === "done" && img.imageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.imageUrl}
                            alt={`${img.productName} - ${img.label}`}
                            className="aspect-square w-full object-cover"
                          />
                          <p className="truncate px-2 py-1 text-xs text-muted-foreground">
                            {img.label}
                          </p>
                        </>
                      ) : img.status === "error" ? (
                        <div className="flex aspect-square flex-col items-center justify-center p-2 text-center">
                          <span className="text-xs text-destructive">Failed</span>
                          <span className="mt-1 text-[10px] text-muted-foreground">
                            {img.label}
                          </span>
                        </div>
                      ) : (
                        <div className="flex aspect-square items-center justify-center">
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Spinner while generating but no images yet */}
          {isGenerating && generatedImages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Starting generation...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
