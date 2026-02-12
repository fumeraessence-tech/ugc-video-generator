"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePerfumeStudioStore } from "@/stores/perfume-studio-store";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export function StepGenerate() {
  const store = usePerfumeStudioStore();
  const { toast } = useToast();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = store.batchStatus === "running" || store.batchStatus === "paused";

  const startPolling = useCallback((jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/perfume/batch-job/${jobId}/status`);
        const data = await res.json();
        store.setBatchStatus(data.status);
        store.setBatchProgress(data.progress || 0);
        store.setBatchMessage(data.message || "");
        store.setCurrentProductName(data.current_product_name || "");
        store.setCompletedCount(data.completed_count || 0);
        store.setTotalProducts(data.total_products || 0);
        store.setBatchPaused(data.paused || false);
        if (data.results) store.setBatchResults(data.results);

        if (data.status === "completed" || data.status === "cancelled") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast({
            title: data.status === "completed" ? "Generation complete!" : "Generation cancelled",
            description: `${data.completed_count} products processed`,
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }, [store, toast]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Resume polling if we have an active job
  useEffect(() => {
    if (store.batchJobId && isActive && !pollingRef.current) {
      startPolling(store.batchJobId);
    }
  }, [store.batchJobId, isActive, startPolling]);

  const startGeneration = async () => {
    const refs = store.getAllReferenceImages();
    if (refs.length === 0) {
      toast({ title: "No references", description: "Upload reference images first", variant: "destructive" });
      return;
    }

    const products = store.csvProducts.length > 0
      ? store.csvProducts
      : [{ perfume_name: store.perfumeName || "Perfume", cleaned_name: store.perfumeName, brand_name: store.brandName, gender: store.gender, notes: store.notes, inspired_by: store.inspiredBy }];

    const productIndices = store.selectedProductIndices.length > 0
      ? store.selectedProductIndices
      : undefined;

    const genderAvatars = {
      male: { images: store.maleAvatar.images, dna: store.maleAvatar.dna },
      female: { images: store.femaleAvatar.images, dna: store.femaleAvatar.dna },
      unisex: { images: store.unisexAvatar.images, dna: store.unisexAvatar.dna },
    };

    store.setBatchStatus("running");
    store.setBatchProgress(0);
    store.setBatchMessage("Starting...");
    store.setBatchResults([]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/perfume/batch-job/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products,
          reference_images: refs,
          product_dna: store.productDNA,
          gender_avatars: genderAvatars,
          inspiration_dna: store.inspirationDNA,
          config: {
            images_per_product: store.imagesPerProduct,
            aspect_ratio: store.aspectRatio,
          },
          product_indices: productIndices,
        }),
      });
      const data = await res.json();
      if (data.success) {
        store.setBatchJobId(data.job_id);
        store.setTotalProducts(data.total_products);
        startPolling(data.job_id);
        toast({ title: "Generation started", description: `Job ${data.job_id}: ${data.total_products} products` });
      }
    } catch (e) {
      store.setBatchStatus("");
      toast({ title: "Failed to start", description: String(e), variant: "destructive" });
    }
  };

  const pauseJob = async () => {
    if (!store.batchJobId) return;
    await fetch(`${BACKEND_URL}/api/v1/perfume/batch-job/${store.batchJobId}/pause`, { method: "POST" });
    store.setBatchPaused(true);
  };

  const resumeJob = async () => {
    if (!store.batchJobId) return;
    await fetch(`${BACKEND_URL}/api/v1/perfume/batch-job/${store.batchJobId}/resume`, { method: "POST" });
    store.setBatchPaused(false);
  };

  const cancelJob = async () => {
    if (!store.batchJobId) return;
    await fetch(`${BACKEND_URL}/api/v1/perfume/batch-job/${store.batchJobId}/cancel`, { method: "POST" });
  };

  const progressPercent = store.batchProgress || 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="size-4" />
              Image Generation
            </CardTitle>
            {store.batchJobId && (
              <Badge variant="outline" className="text-xs font-mono">
                Job: {store.batchJobId}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isActive && store.batchStatus !== "completed" && (
            <Button onClick={startGeneration} className="w-full" size="lg">
              <Rocket className="size-4 mr-2" />
              Start Generation
            </Button>
          )}

          {(isActive || store.batchStatus === "completed" || store.batchStatus === "cancelled") && (
            <>
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {store.batchMessage || (store.batchPaused ? "Paused" : "Processing...")}
                  </span>
                  <span className="font-mono">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      store.batchPaused ? "bg-yellow-500" : store.batchStatus === "completed" ? "bg-green-500" : "bg-primary"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {store.completedCount} / {store.totalProducts} products
                  </span>
                  {store.currentProductName && isActive && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      {store.currentProductName}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              {isActive && (
                <div className="flex gap-2">
                  {store.batchPaused ? (
                    <Button onClick={resumeJob} variant="outline" className="flex-1">
                      <Play className="size-3 mr-1.5" />
                      Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseJob} variant="outline" className="flex-1">
                      <Pause className="size-3 mr-1.5" />
                      Pause
                    </Button>
                  )}
                  <Button onClick={cancelJob} variant="destructive" size="sm">
                    <Square className="size-3 mr-1.5" />
                    Cancel
                  </Button>
                </div>
              )}

              {store.batchStatus === "completed" && (
                <div className="text-center py-2">
                  <p className="text-sm font-medium text-green-600">Generation Complete!</p>
                  <p className="text-xs text-muted-foreground">
                    {store.batchResults.filter(r => r.status === "success").length} products successful,{" "}
                    {store.batchResults.reduce((acc, r) => acc + (r.count || 0), 0)} total images
                  </p>
                </div>
              )}
            </>
          )}

          {/* Live thumbnails */}
          {store.batchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Generated Products:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {store.batchResults.map((result, idx) => (
                  <div key={idx} className="rounded-lg border p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{result.perfume_name}</span>
                      <Badge
                        variant={result.status === "success" ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {result.status === "success" ? `${result.count} images` : result.status}
                      </Badge>
                    </div>
                    {result.images?.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto">
                        {result.images.slice(0, 4).map((img, i) => (
                          <div key={i} className="size-10 rounded overflow-hidden flex-shrink-0 border">
                            {img.image_url && !img.image_url.startsWith("Error") ? (
                              <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center text-[8px] text-muted-foreground">err</div>
                            )}
                          </div>
                        ))}
                        {result.images.length > 4 && (
                          <div className="size-10 rounded border flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                            +{result.images.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
