"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  X,
  Loader2,
  Sparkles,
  Play,
  Pause,
  Square,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProductStudioStore } from "@/stores/product-studio-store";
import { backendFetch } from "@/lib/backend-fetch";

export function StepInspiration() {
  const store = useProductStudioStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = store.inspirationStatus === "running" || store.inspirationStatus === "paused";

  // ─── Image Upload ──────────────────────────────────────────────

  const uploadImages = useCallback(
    async (files: File[]) => {
      setUploading(true);
      try {
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));
        const res = await backendFetch("/api/v1/product-studio/upload-inspiration", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.urls?.length) {
          store.addInspirationImages(data.urls);
          toast({ title: `${data.urls.length} inspiration images uploaded` });
        }
      } catch (e) {
        toast({ title: "Upload failed", description: String(e), variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [store, toast]
  );

  // ─── Polling ───────────────────────────────────────────────────

  const startPolling = useCallback(
    (jobId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const res = await backendFetch(`/api/v1/product-studio/job/${jobId}/status`);
          const data = await res.json();
          store.setInspirationStatus(data.status);
          store.setInspirationProgress(data.progress || 0);
          store.setInspirationMessage(data.message || "");
          store.setInspirationCurrentProduct(data.current_product_name || "");
          store.setInspirationCompletedCount(data.completed_count || 0);
          store.setInspirationTotalProducts(data.total_products || 0);
          store.setInspirationPaused(data.paused || false);
          if (data.results) store.setInspirationResults(data.results);

          if (data.status === "completed" || data.status === "cancelled") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            toast({
              title: data.status === "completed" ? "Styled generation complete!" : "Generation cancelled",
              description: `${data.completed_count} products processed`,
            });
          }
        } catch {
          // ignore
        }
      }, 2000);
    },
    [store, toast]
  );

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (store.inspirationJobId && isActive && !pollingRef.current) {
      startPolling(store.inspirationJobId);
    }
  }, [store.inspirationJobId, isActive, startPolling]);

  // ─── Generation ────────────────────────────────────────────────

  const startGeneration = async () => {
    const whiteBgMap = store.getWhiteBgImageMap();
    if (Object.keys(whiteBgMap).length === 0) {
      toast({ title: "No white-bg images", description: "Generate white-bg images first", variant: "destructive" });
      return;
    }

    store.setInspirationStatus("running");
    store.setInspirationProgress(0);
    store.setInspirationMessage("Starting...");
    store.setInspirationResults([]);

    try {
      const res = await backendFetch("/api/v1/product-studio/inspiration/start", {
        method: "POST",
        body: JSON.stringify({
          products: store.csvProducts,
          white_bg_images: whiteBgMap,
          inspiration_images: store.inspirationImages,
          angles_per_product: 5,
          aspect_ratio: "1:1",
          product_indices: store.selectedProductIndices,
        }),
      });
      const data = await res.json();
      if (data.success) {
        store.setInspirationJobId(data.job_id);
        store.setInspirationTotalProducts(data.total_products);
        startPolling(data.job_id);
        toast({ title: "Styled generation started", description: `${data.total_products} products × 5 angles` });
      }
    } catch (e) {
      store.setInspirationStatus("");
      toast({ title: "Failed to start", description: String(e), variant: "destructive" });
    }
  };

  const pauseJob = async () => {
    if (!store.inspirationJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.inspirationJobId}/pause`, { method: "POST" });
  };

  const resumeJob = async () => {
    if (!store.inspirationJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.inspirationJobId}/resume`, { method: "POST" });
  };

  const cancelJob = async () => {
    if (!store.inspirationJobId) return;
    await backendFetch(`/api/v1/product-studio/job/${store.inspirationJobId}/cancel`, { method: "POST" });
  };

  const progress = store.inspirationProgress || 0;

  return (
    <div className="space-y-4">
      {/* Inspiration Upload */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="size-4" />
                Inspiration Images
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Upload Pinterest or styled product photos as aesthetic references
              </p>
            </div>
            <Badge variant="outline">{store.inspirationImages.length} images</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {store.inspirationImages.length > 0 && (
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-48 overflow-y-auto">
              {store.inspirationImages.map((url) => (
                <div key={url} className="relative group aspect-square rounded overflow-hidden border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => store.removeInspirationImage(url)}
                    className="absolute top-0 right-0 p-0.5 bg-destructive text-destructive-foreground rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-2" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="flex flex-col items-center justify-center h-20 rounded-lg border-2 border-dashed cursor-pointer hover:border-foreground/30 transition-colors">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Upload className="size-4 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Upload inspiration images</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) uploadImages(files);
                e.target.value = "";
              }}
            />
          </label>

          {store.inspirationImages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => store.setInspirationImages([])}
            >
              Clear All
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Generation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Rocket className="size-4" />
              Styled Generation
            </CardTitle>
            {store.inspirationJobId && (
              <Badge variant="outline" className="text-xs font-mono">
                {store.inspirationJobId}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Generate 5 styled angle variations per product using white-bg images + inspiration style.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isActive && store.inspirationStatus !== "completed" && (
            <Button onClick={startGeneration} className="w-full" size="lg">
              <Rocket className="size-4 mr-2" />
              Generate Styled Images
            </Button>
          )}

          {(isActive || store.inspirationStatus === "completed" || store.inspirationStatus === "cancelled") && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {store.inspirationMessage || (store.inspirationPaused ? "Paused" : "Processing...")}
                  </span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      store.inspirationPaused
                        ? "bg-yellow-500"
                        : store.inspirationStatus === "completed"
                        ? "bg-foreground"
                        : "bg-foreground/70"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {store.inspirationCompletedCount} / {store.inspirationTotalProducts} products
                  </span>
                  {store.inspirationCurrentProduct && isActive && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" />
                      {store.inspirationCurrentProduct}
                    </span>
                  )}
                </div>
              </div>

              {isActive && (
                <div className="flex gap-2">
                  {store.inspirationPaused ? (
                    <Button onClick={resumeJob} variant="outline" className="flex-1" size="sm">
                      <Play className="size-3 mr-1.5" />Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseJob} variant="outline" className="flex-1" size="sm">
                      <Pause className="size-3 mr-1.5" />Pause
                    </Button>
                  )}
                  <Button onClick={cancelJob} variant="destructive" size="sm">
                    <Square className="size-3 mr-1.5" />Cancel
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Live results */}
          {store.inspirationResults.length > 0 && (
            <div className="space-y-3">
              {store.inspirationResults.map((result) => (
                <div key={result.product_index} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{result.perfume_name}</span>
                    <Badge
                      variant={result.status === "success" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {result.count} images
                    </Badge>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {result.images
                      .filter((img) => img.image_url && !img.image_url.startsWith("Error"))
                      .map((img, i) => (
                        <div key={i} className="size-14 rounded overflow-hidden flex-shrink-0 border">
                          <img src={img.image_url} alt={img.label} className="w-full h-full object-cover" />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
